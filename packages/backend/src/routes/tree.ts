import { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import path from 'node:path';

interface FileRow {
  path: string;
  language: string;
  line_count: number;
  exports: string;
  imports: string;
}

interface TreeChild {
  type: 'directory' | 'file';
  name: string;
  path: string;
  stats: { fileCount: number; lineCount: number; complexityScore: number };
  childCount?: number;
  exports?: string[];
}

interface TreeEdge {
  source: string;
  target: string;
  weight: number;
}

export async function treeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects/:id/tree', async (request, reply) => {
    const { id } = request.params as { id: string };
    const queryPath = (request.query as { path?: string }).path || '';

    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Get all files for this project
    const allFiles = db.prepare(
      'SELECT path, language, line_count, exports, imports FROM files WHERE project_id = ?'
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

      children.push({
        type: 'directory',
        name: path.basename(dirPath),
        path: dirPath,
        stats: { fileCount, lineCount: totalLines, complexityScore },
        childCount: childNames.size,
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
