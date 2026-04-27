import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { scanFileTree, readFileContent } from './scanner.js';
import { parseFile } from './parser.js';
import { detectModules } from './module-detector.js';
import { resolveDependencies } from './dependency-resolver.js';
import { loadPathAliases } from './tsconfig-resolver.js';
import type { ScanJob } from '../types/index.js';

// In-memory scan job tracking with TTL cleanup
const scanJobs = new Map<string, ScanJob>();
const projectJobIndex = new Map<string, string>(); // projectId → jobId
const JOB_TTL_MS = 5 * 60 * 1000; // 5 minutes after completion

export function getScanJob(jobId: string): ScanJob | undefined {
  return scanJobs.get(jobId);
}

export function getProjectScanJob(projectId: string): ScanJob | undefined {
  const jobId = projectJobIndex.get(projectId);
  return jobId ? scanJobs.get(jobId) : undefined;
}

function cleanupJob(jobId: string, projectId: string): void {
  setTimeout(() => {
    scanJobs.delete(jobId);
    if (projectJobIndex.get(projectId) === jobId) {
      projectJobIndex.delete(projectId);
    }
  }, JOB_TTL_MS);
}

export interface ScanOptions {
  pullFirst?: {
    localPath: string;
    token: string | null;
    gitUrl: string;
  };
}

export async function runAnalysis(projectId: string, projectRoot: string, options?: ScanOptions): Promise<string> {
  const jobId = nanoid();
  const job: ScanJob = { id: jobId, projectId, status: options?.pullFirst ? 'cloning' : 'parsing' };
  scanJobs.set(jobId, job);
  projectJobIndex.set(projectId, jobId);

  const run = async () => {
    // Git pull if requested
    if (options?.pullFirst) {
      const { pullRepo } = await import('./git.js');
      await pullRepo(options.pullFirst.localPath, options.pullFirst.token, options.pullFirst.gitUrl);
    }
    await doAnalysis(job, projectRoot);
  };

  run()
    .then(() => { cleanupJob(jobId, projectId); })
    .catch(err => {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      // Translate git auth errors
      if (job.error.includes('Authentication') || job.error.includes('auth')) {
        job.error = '认证失败，请更新 Token';
      }
      const db = getDb();
      db.prepare('UPDATE projects SET scan_error = ? WHERE id = ?').run(job.error, projectId);
      cleanupJob(jobId, projectId);
    });

  return jobId;
}

async function doAnalysis(job: ScanJob, projectRoot: string): Promise<void> {
  const db = getDb();
  const projectId = job.projectId;

  // Step 1: Load path aliases from tsconfig
  const aliases = await loadPathAliases(projectRoot);

  // Step 3: Scan file tree
  job.status = 'parsing';
  const scannedFiles = await scanFileTree(projectRoot);
  job.filesTotal = scannedFiles.length;
  job.filesParsed = 0;

  // Step 4: Parse each file
  const fileImports: Array<{
    relativePath: string;
    moduleName: string;
    imports: Array<{ source: string; line: number }>;
  }> = [];

  const fileParsedData: Array<{
    relativePath: string;
    moduleName: string;
    lineCount: number;
    exports: Array<{ name: string; kind: string; line: number }>;
    imports: Array<{ source: string; line: number }>;
  }> = [];

  for (const file of scannedFiles) {
    try {
      const content = await readFileContent(file.absolutePath);
      const result = parseFile(content);

      fileParsedData.push({
        relativePath: file.relativePath,
        moduleName: file.moduleName,
        lineCount: result.lineCount,
        exports: result.exports,
        imports: result.imports,
      });

      fileImports.push({
        relativePath: file.relativePath,
        moduleName: file.moduleName,
        imports: result.imports,
      });
    } catch {
      // Skip files that fail to parse
      fileParsedData.push({
        relativePath: file.relativePath,
        moduleName: file.moduleName,
        lineCount: 0,
        exports: [],
        imports: [],
      });
    }
    job.filesParsed = (job.filesParsed || 0) + 1;
  }

  // Step 5: Detect modules
  job.status = 'analyzing';
  const modules = detectModules(scannedFiles);

  // Step 6: Resolve dependencies
  const dependencies = resolveDependencies(fileImports, modules, projectRoot, aliases);

  // Step 7: Write to DB in a transaction
  const writeAll = db.transaction(() => {
    // Clear old data for this project
    db.prepare('DELETE FROM dependencies WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM files WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM modules WHERE project_id = ?').run(projectId);

    // Insert modules
    const insertModule = db.prepare(`
      INSERT INTO modules (id, project_id, name, path, file_count, line_count, complexity_score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const moduleIdMap = new Map<string, string>(); // moduleName → id

    for (const mod of modules) {
      const moduleId = nanoid();
      moduleIdMap.set(mod.name, moduleId);

      const moduleFiles = fileParsedData.filter(f => f.moduleName === mod.name);
      const fileCount = moduleFiles.length;
      const lineCount = moduleFiles.reduce((sum, f) => sum + f.lineCount, 0);

      // Complexity: weighted combination of file count, line count, and dependency count
      const depCount = dependencies.filter(
        d => d.sourceModule === mod.name || d.targetModule === mod.name
      ).length;
      const complexity = Math.min(100, (fileCount * 2) + (lineCount / 100) + (depCount * 10));

      insertModule.run(moduleId, projectId, mod.name, mod.path, fileCount, lineCount, complexity);
    }

    // Insert files
    const insertFile = db.prepare(`
      INSERT INTO files (id, module_id, project_id, path, language, line_count, exports, imports)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const file of fileParsedData) {
      const moduleId = moduleIdMap.get(file.moduleName);
      if (!moduleId) continue;

      const ext = file.relativePath.split('.').pop() || '';
      const language = ext === 'ts' || ext === 'tsx' ? 'typescript' : 'javascript';

      insertFile.run(
        nanoid(),
        moduleId,
        projectId,
        file.relativePath,
        language,
        file.lineCount,
        JSON.stringify(file.exports.map(e => e.name)),
        JSON.stringify(file.imports.map(i => ({
          source: i.source,
          isExternal: !i.source.startsWith('.') && !aliases.some(a => i.source.startsWith(a.prefix)),
        })))
      );
    }

    // Insert dependencies
    const insertDep = db.prepare(`
      INSERT OR REPLACE INTO dependencies (id, project_id, source_module_id, target_module_id, weight)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const dep of dependencies) {
      const sourceId = moduleIdMap.get(dep.sourceModule);
      const targetId = moduleIdMap.get(dep.targetModule);
      if (!sourceId || !targetId) continue;

      insertDep.run(nanoid(), projectId, sourceId, targetId, dep.weight);
    }

    // Update project scan timestamp
    db.prepare('UPDATE projects SET last_scanned_at = datetime(\'now\'), scan_error = NULL WHERE id = ?')
      .run(projectId);
  });

  writeAll();

  job.status = 'done';
}
