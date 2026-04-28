import { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import path from 'node:path';

interface FileRow {
  path: string;
  language: string;
  line_count: number;
  exports: string;
  imports: string;
  description: string | null;
  role: string | null;
}

interface TreeChild {
  type: 'directory' | 'file';
  name: string;
  path: string;
  stats: { fileCount: number; lineCount: number; complexityScore: number };
  childCount?: number;
  exports?: string[];
  description?: string;
  role?: string;
}

interface TreeEdge {
  source: string;
  target: string;
  weight: number;
}

export async function treeRoutes(app: FastifyInstance): Promise<void> {

  // Node detail — returns detail for any path (file or directory) in ModuleDetail format
  app.get('/api/projects/:id/node-detail', async (request, reply) => {
    const { id } = request.params as { id: string };
    const nodePath = (request.query as { path?: string }).path || '';

    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const allFiles = db.prepare(
      'SELECT path, language, line_count, exports, imports, description, role FROM files WHERE project_id = ?'
    ).all(id) as FileRow[];

    const allFilePaths = new Set(allFiles.map(f => f.path));

    // Find files for this node
    const isFile = allFiles.some(f => f.path === nodePath);
    const nodeFiles = isFile
      ? allFiles.filter(f => f.path === nodePath)
      : allFiles.filter(f => f.path.startsWith(nodePath + '/'));

    if (nodeFiles.length === 0) {
      return reply.status(404).send({ error: 'Node not found' });
    }

    const totalLines = nodeFiles.reduce((s, f) => s + f.line_count, 0);
    const fileCount = nodeFiles.length;
    const avgLines = fileCount > 0 ? totalLines / fileCount : 0;
    const rawScore = isFile
      ? Math.min(Math.round(nodeFiles[0].line_count / 5), 100)
      : Math.min(Math.round((fileCount * 0.3 + Math.min(totalLines / 100, 100) * 0.3 + Math.min(avgLines / 50, 100) * 0.4)), 100);

    // Compute dependencies (outgoing and incoming) at file level
    const nodeFilePaths = new Set(nodeFiles.map(f => f.path));
    const dependsOnMap = new Map<string, number>();
    const dependedByMap = new Map<string, number>();

    for (const file of nodeFiles) {
      const imports: Array<{ source: string; isExternal: boolean }> = JSON.parse(file.imports || '[]');
      for (const imp of imports) {
        if (imp.isExternal) continue;
        const resolved = resolveImport(file.path, imp.source, allFilePaths);
        if (resolved && !nodeFilePaths.has(resolved)) {
          // Find the top-level directory of the target
          const targetLabel = getDirectoryLabel(resolved, nodePath);
          dependsOnMap.set(targetLabel, (dependsOnMap.get(targetLabel) || 0) + 1);
        }
      }
    }

    // Incoming: other files that import from this node
    for (const file of allFiles) {
      if (nodeFilePaths.has(file.path)) continue;
      const imports: Array<{ source: string; isExternal: boolean }> = JSON.parse(file.imports || '[]');
      for (const imp of imports) {
        if (imp.isExternal) continue;
        const resolved = resolveImport(file.path, imp.source, allFilePaths);
        if (resolved && nodeFilePaths.has(resolved)) {
          const sourceLabel = getDirectoryLabel(file.path, nodePath);
          dependedByMap.set(sourceLabel, (dependedByMap.get(sourceLabel) || 0) + 1);
        }
      }
    }

    // Get description and role
    const primaryFile = isFile ? nodeFiles[0] : null;
    const description = primaryFile?.description || aggregateDescription(nodeFiles);
    const role = primaryFile?.role || 'normal';

    // Layer 5: Impact analysis
    const { computeImpact } = await import('../analysis/annotator.js');
    const impact = computeImpact(id, nodePath);

    // Layer 4: Groups
    const groups = db.prepare(
      'SELECT group_name, file_paths FROM file_groups WHERE project_id = ? AND parent_path = ?'
    ).all(id, path.dirname(nodePath)) as Array<{ group_name: string; file_paths: string }>;

    const nodeGroups = groups
      .filter(g => {
        const paths: string[] = JSON.parse(g.file_paths);
        return paths.includes(nodePath);
      })
      .map(g => g.group_name);

    return {
      id: nodePath,
      name: path.basename(nodePath),
      path: nodePath,
      fileCount,
      lineCount: totalLines,
      complexityScore: rawScore,
      description,
      role,
      impact,
      groups: nodeGroups,
      files: nodeFiles.map(f => ({
        path: f.path,
        language: f.language,
        lineCount: f.line_count,
        exports: JSON.parse(f.exports || '[]'),
        imports: JSON.parse(f.imports || '[]'),
      })),
      dependsOn: Array.from(dependsOnMap.entries()).map(([name, weight]) => ({ targetModule: name, weight })).sort((a, b) => b.weight - a.weight),
      dependedBy: Array.from(dependedByMap.entries()).map(([name, weight]) => ({ sourceModule: name, weight })).sort((a, b) => b.weight - a.weight),
    };
  });

  app.get('/api/projects/:id/tree', async (request, reply) => {
    const { id } = request.params as { id: string };
    const queryPath = (request.query as { path?: string }).path || '';

    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Get all files for this project
    const allFiles = db.prepare(
      'SELECT path, language, line_count, exports, imports, description, role FROM files WHERE project_id = ?'
    ).all(id) as FileRow[];

    // Filter files under the requested path
    const prefix = queryPath ? queryPath + '/' : '';
    const filesUnderPath = queryPath
      ? allFiles.filter(f => f.path.startsWith(prefix))
      : allFiles;

    if (filesUnderPath.length === 0) {
      return { currentPath: queryPath, children: [], edges: [] };
    }

    // Group into immediate children at this level
    const dirStats = new Map<string, { files: FileRow[]; childNames: Set<string> }>();
    const directFiles: FileRow[] = [];

    for (const file of filesUnderPath) {
      const relativePath = queryPath ? file.path.slice(prefix.length) : file.path;
      const slashIndex = relativePath.indexOf('/');

      if (slashIndex === -1) {
        // Direct file at this level
        directFiles.push(file);
      } else {
        // File belongs to a subdirectory
        const dirName = relativePath.slice(0, slashIndex);
        const dirPath = queryPath ? `${queryPath}/${dirName}` : dirName;
        if (!dirStats.has(dirPath)) {
          dirStats.set(dirPath, { files: [], childNames: new Set() });
        }
        const entry = dirStats.get(dirPath)!;
        entry.files.push(file);
        // Track immediate children of this dir for childCount
        const rest = relativePath.slice(slashIndex + 1);
        const nextSlash = rest.indexOf('/');
        entry.childNames.add(nextSlash === -1 ? rest : rest.slice(0, nextSlash));
      }
    }

    // Build children array
    const children: TreeChild[] = [];

    // Directories
    for (const [dirPath, { files, childNames }] of dirStats) {
      const totalLines = files.reduce((s, f) => s + f.line_count, 0);
      const fileCount = files.length;
      const avgLines = fileCount > 0 ? totalLines / fileCount : 0;
      // Complexity: normalized score based on file count, total lines, avg file size
      const rawScore = (fileCount * 0.3 + Math.min(totalLines / 100, 100) * 0.3 + Math.min(avgLines / 50, 100) * 0.4);
      const complexityScore = Math.min(Math.round(rawScore), 100);

      // Aggregate description from child file descriptions
      const descriptions = files
        .map(f => f.description)
        .filter((d): d is string => !!d && d !== '');
      const descWords = new Map<string, number>();
      for (const desc of descriptions) {
        for (const word of desc.split(/[/·,，、]/).map(w => w.trim()).filter(Boolean)) {
          descWords.set(word, (descWords.get(word) || 0) + 1);
        }
      }
      const topWords = [...descWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
      const dirDescription = topWords.length > 0 ? topWords.join('、') : undefined;

      children.push({
        type: 'directory',
        name: path.basename(dirPath),
        path: dirPath,
        stats: { fileCount, lineCount: totalLines, complexityScore },
        childCount: childNames.size,
        description: dirDescription,
      });
    }

    // Files
    for (const file of directFiles) {
      const lineCount = file.line_count;
      // File complexity: simple heuristic based on line count
      const complexityScore = Math.min(Math.round(lineCount / 5), 100);

      children.push({
        type: 'file',
        name: path.basename(file.path),
        path: file.path,
        stats: { fileCount: 1, lineCount, complexityScore },
        exports: JSON.parse(file.exports || '[]'),
        description: file.description || undefined,
        role: file.role || undefined,
      });
    }

    // Sort: directories first (by line count desc), then files (by line count desc)
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return b.stats.lineCount - a.stats.lineCount;
    });

    // Build edges: resolve file imports to current-level nodes
    const edges = buildEdges(allFiles, filesUnderPath, children, queryPath);

    return { currentPath: queryPath, children, edges };
  });
}

/**
 * Build dependency edges between children at the current tree level.
 * Resolves file-level imports to the appropriate child node (directory or file).
 */
function buildEdges(
  allFiles: FileRow[],
  filesUnderPath: FileRow[],
  children: TreeChild[],
  currentPath: string,
): TreeEdge[] {
  const prefix = currentPath ? currentPath + '/' : '';

  // Build a lookup: file path → which child node it belongs to
  const fileToChild = new Map<string, string>();
  for (const child of children) {
    if (child.type === 'file') {
      fileToChild.set(child.path, child.path);
    } else {
      // All files under this directory map to the directory node
      for (const f of filesUnderPath) {
        if (f.path.startsWith(child.path + '/')) {
          fileToChild.set(f.path, child.path);
        }
      }
    }
  }

  // Build a lookup: all project file paths for import resolution
  const allFilePaths = new Set(allFiles.map(f => f.path));

  // Aggregate edges
  const edgeMap = new Map<string, number>();

  for (const file of filesUnderPath) {
    const sourceChild = fileToChild.get(file.path);
    if (!sourceChild) continue;

    const imports: Array<{ source: string; isExternal: boolean }> = JSON.parse(file.imports || '[]');
    for (const imp of imports) {
      if (imp.isExternal) continue;

      // Resolve import path relative to the importing file's directory
      const resolved = resolveImport(file.path, imp.source, allFilePaths);
      if (!resolved) continue;

      const targetChild = fileToChild.get(resolved);
      if (!targetChild || targetChild === sourceChild) continue;

      const key = `${sourceChild}::${targetChild}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }

  return Array.from(edgeMap.entries()).map(([key, weight]) => {
    const [source, target] = key.split('::');
    return { source, target, weight };
  });
}

/**
 * Resolve a relative import path to an actual file path in the project.
 * Tries common extensions: .ts, .tsx, .js, .jsx, /index.ts, /index.tsx, /index.js
 */
function resolveImport(
  importerPath: string,
  importSource: string,
  allFilePaths: Set<string>,
): string | null {
  // Only handle relative imports
  if (!importSource.startsWith('.')) return null;

  const importerDir = path.dirname(importerPath);
  const resolved = path.normalize(path.join(importerDir, importSource));

  // Try exact match first
  if (allFilePaths.has(resolved)) return resolved;

  // Try extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  for (const ext of extensions) {
    if (allFilePaths.has(resolved + ext)) return resolved + ext;
  }

  // Try index files
  const indexFiles = extensions.map(ext => path.join(resolved, `index${ext}`));
  for (const indexPath of indexFiles) {
    if (allFilePaths.has(indexPath)) return indexPath;
  }

  return null;
}

function aggregateDescription(files: FileRow[]): string {
  const descriptions = files.map(f => f.description).filter((d): d is string => !!d && d !== '');
  const words = new Map<string, number>();
  for (const desc of descriptions) {
    for (const word of desc.split(/[/·,，、]/).map(w => w.trim()).filter(Boolean)) {
      words.set(word, (words.get(word) || 0) + 1);
    }
  }
  const top = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
  return top.length > 0 ? top.join('、') : '';
}

/**
 * Get a human-readable label for a file path relative to the context.
 * E.g. for "src/core/parser.ts" in context "src/routes.ts", returns "src/core"
 */
function getDirectoryLabel(filePath: string, contextPath: string): string {
  // Find common parent, then take the first segment that differs
  const parts = filePath.split('/');
  if (parts.length <= 1) return filePath;
  // Return the parent directory of the file
  return parts.slice(0, -1).join('/') || parts[0];
}
