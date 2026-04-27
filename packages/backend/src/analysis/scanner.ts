import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.vite',
  'coverage', '.turbo', '.cache', '__pycache__', '.output'
]);

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  moduleName: string;
  extension: string;
}

export async function scanFileTree(projectRoot: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  const moduleBase = await detectModuleBase(projectRoot);

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && TS_EXTENSIONS.has(path.extname(entry.name))) {
        const relativePath = path.relative(projectRoot, fullPath);
        const moduleName = resolveModuleName(relativePath, moduleBase);
        files.push({
          absolutePath: fullPath,
          relativePath,
          moduleName,
          extension: path.extname(entry.name),
        });
      }
    }
  }

  await walk(projectRoot);
  return files;
}

/**
 * Detect if modules should be based on root-level dirs or src/ subdirs.
 * If root only has a single `src/` dir with code, use src's children as modules.
 */
async function detectModuleBase(projectRoot: string): Promise<string> {
  const entries = await readdir(projectRoot, { withFileTypes: true });
  const codeDirs = entries.filter(
    e => e.isDirectory() && !e.name.startsWith('.') && !IGNORE_DIRS.has(e.name)
  );

  if (codeDirs.length === 1 && codeDirs[0].name === 'src') {
    return 'src';
  }
  return '';
}

function resolveModuleName(relativePath: string, moduleBase: string): string {
  const pathFromBase = moduleBase
    ? relativePath.replace(new RegExp(`^${moduleBase}/`), '')
    : relativePath;

  const parts = pathFromBase.split(path.sep);
  // First directory = module name. Root-level files → "root" module
  return parts.length > 1 ? parts[0] : '__root__';
}

export async function readFileContent(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

export function countLines(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
}
