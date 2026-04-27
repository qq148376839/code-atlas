import path from 'node:path';
import type { DetectedModule } from './module-detector.js';
import type { ParsedImport } from './parser.js';
import type { PathAlias } from './tsconfig-resolver.js';
import { resolveImportPath } from './tsconfig-resolver.js';

export interface ModuleDependency {
  sourceModule: string;
  targetModule: string;
  weight: number;
}

interface FileImportInfo {
  relativePath: string;
  moduleName: string;
  imports: ParsedImport[];
}

/**
 * Compute inter-module dependencies from file-level import data.
 */
export function resolveDependencies(
  fileImports: FileImportInfo[],
  modules: DetectedModule[],
  projectRoot: string,
  aliases: PathAlias[]
): ModuleDependency[] {
  // Build a map: resolved file path → module name
  const fileToModule = new Map<string, string>();
  for (const mod of modules) {
    for (const file of mod.files) {
      // Store without extension for matching
      fileToModule.set(file.relativePath, mod.name);
      fileToModule.set(stripExtension(file.relativePath), mod.name);
    }
  }

  // Count dependencies between modules
  const depCounts = new Map<string, number>(); // "source→target" → count

  for (const fileInfo of fileImports) {
    const sourceModule = fileInfo.moduleName;

    for (const imp of fileInfo.imports) {
      const resolved = resolveImportPath(
        imp.source,
        path.join(projectRoot, fileInfo.relativePath),
        projectRoot,
        aliases
      );

      if (!resolved) continue; // External dep, skip

      // Find which module this resolved path belongs to
      const targetModule = findModuleForPath(resolved, fileToModule);
      if (!targetModule || targetModule === sourceModule) continue; // Self-dep or unresolved

      const key = `${sourceModule}→${targetModule}`;
      depCounts.set(key, (depCounts.get(key) || 0) + 1);
    }
  }

  // Convert to array
  const dependencies: ModuleDependency[] = [];
  for (const [key, weight] of depCounts) {
    const [sourceModule, targetModule] = key.split('→');
    dependencies.push({ sourceModule, targetModule, weight });
  }

  return dependencies.sort((a, b) => b.weight - a.weight);
}

function findModuleForPath(resolvedPath: string, fileToModule: Map<string, string>): string | null {
  // Try exact match
  if (fileToModule.has(resolvedPath)) return fileToModule.get(resolvedPath)!;

  // Try without extension
  const noExt = stripExtension(resolvedPath);
  if (fileToModule.has(noExt)) return fileToModule.get(noExt)!;

  // Try with common extensions
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
    const withExt = noExt + ext;
    if (fileToModule.has(withExt)) return fileToModule.get(withExt)!;
  }

  // Try as directory import (index file)
  const indexPath = resolvedPath + '/index';
  if (fileToModule.has(indexPath)) return fileToModule.get(indexPath)!;

  // Fallback: derive module from path's first segment
  const parts = resolvedPath.split(path.sep);
  const firstDir = parts[0];
  // Check if this first dir is a known module
  for (const [, moduleName] of fileToModule) {
    if (moduleName === firstDir) return moduleName;
  }

  return null;
}

function stripExtension(filePath: string): string {
  return filePath.replace(/\.(ts|tsx|js|jsx|mjs)$/, '');
}
