import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PathAlias {
  prefix: string;
  targets: string[];
}

/**
 * Read tsconfig.json and extract path aliases.
 * Returns a map of alias prefix → resolved directory paths.
 */
export async function loadPathAliases(projectRoot: string): Promise<PathAlias[]> {
  const aliases: PathAlias[] = [];

  try {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const raw = await readFile(tsconfigPath, 'utf-8');
    // Strip comments (// and /* */) for JSON parsing
    const cleaned = raw
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,\s*([}\]])/g, '$1');
    const tsconfig = JSON.parse(cleaned);

    const paths = tsconfig.compilerOptions?.paths;
    const baseUrl = tsconfig.compilerOptions?.baseUrl || '.';

    if (paths) {
      for (const [pattern, targets] of Object.entries(paths)) {
        // pattern like "@/*" → prefix "@/"
        const prefix = pattern.replace(/\*$/, '');
        const resolvedTargets = (targets as string[]).map(t =>
          path.resolve(projectRoot, baseUrl, t.replace(/\*$/, ''))
        );
        aliases.push({ prefix, targets: resolvedTargets });
      }
    }
  } catch {
    // No tsconfig or invalid - proceed without aliases
  }

  return aliases;
}

/**
 * Resolve an import specifier to a project-relative path.
 * Returns null if it's an external package (node_modules).
 */
export function resolveImportPath(
  specifier: string,
  importingFile: string,
  projectRoot: string,
  aliases: PathAlias[]
): string | null {
  // External package (no relative path prefix, no alias match)
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    // Check if it matches any alias
    for (const alias of aliases) {
      if (specifier.startsWith(alias.prefix)) {
        const remainder = specifier.slice(alias.prefix.length);
        const resolved = path.join(alias.targets[0], remainder);
        return path.relative(projectRoot, resolved);
      }
    }
    // No alias match → external package
    return null;
  }

  // Relative import
  const importerDir = path.dirname(importingFile);
  const resolved = path.resolve(importerDir, specifier);
  return path.relative(projectRoot, resolved);
}
