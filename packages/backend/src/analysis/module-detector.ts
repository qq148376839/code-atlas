import type { ScannedFile } from './scanner.js';

export interface DetectedModule {
  name: string;
  path: string;
  files: ScannedFile[];
}

/**
 * Group scanned files into modules.
 * Strategy: first-level directory = one module.
 */
export function detectModules(files: ScannedFile[]): DetectedModule[] {
  const moduleMap = new Map<string, ScannedFile[]>();

  for (const file of files) {
    const existing = moduleMap.get(file.moduleName) || [];
    existing.push(file);
    moduleMap.set(file.moduleName, existing);
  }

  const modules: DetectedModule[] = [];
  for (const [name, moduleFiles] of moduleMap) {
    // Determine module path (common prefix of all files in this module)
    const modulePath = name === '__root__' ? '.' : name;
    modules.push({ name, path: modulePath, files: moduleFiles });
  }

  return modules.sort((a, b) => a.name.localeCompare(b.name));
}
