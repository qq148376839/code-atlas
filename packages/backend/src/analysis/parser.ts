/**
 * Regex-based TypeScript import/export parser.
 * Handles all standard TS import/export syntax patterns including multi-line.
 * Sufficient for single-language (TS) analysis; upgrade to tree-sitter when adding multi-language.
 */

export interface ParsedImport {
  source: string;
  line: number;
}

export interface ParsedExport {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'default' | 'reexport' | 'unknown';
  line: number;
}

export interface ParseResult {
  imports: ParsedImport[];
  exports: ParsedExport[];
  lineCount: number;
}

// Matches: import ... from 'source' / import 'source'
const IMPORT_RE = /^\s*import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/;

// Matches: export ... from 'source'
const REEXPORT_RE = /^\s*export\s+(?:(?:[\w*{}\s,]+)\s+from\s+)['"]([^'"]+)['"]/;

// Matches: export default ...
const EXPORT_DEFAULT_RE = /^\s*export\s+default\s+/;

// Matches: export function name / export class name / export const name etc.
const EXPORT_NAMED_RE = /^\s*export\s+(?:declare\s+)?(function|class|const|let|var|type|interface|enum)\s+(\w+)/;

// Matches: export { ... }
const EXPORT_DESTRUCTURE_RE = /^\s*export\s+\{([^}]+)\}/;

export function parseFile(content: string): ParseResult {
  const lineCount = content.split('\n').length;
  const cleaned = stripComments(content);
  const normalized = joinMultiLineStatements(cleaned);
  const lines = normalized.split('\n');

  const imports: ParsedImport[] = [];
  const exports: ParsedExport[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check re-exports first (they're also imports)
    const reexportMatch = line.match(REEXPORT_RE);
    if (reexportMatch) {
      imports.push({ source: reexportMatch[1], line: lineNum });
      exports.push({ name: '*', kind: 'reexport', line: lineNum });
      continue;
    }

    // Check imports
    const importMatch = line.match(IMPORT_RE);
    if (importMatch) {
      imports.push({ source: importMatch[1], line: lineNum });
      continue;
    }

    // Check export default
    if (EXPORT_DEFAULT_RE.test(line)) {
      exports.push({ name: 'default', kind: 'default', line: lineNum });
      continue;
    }

    // Check named exports
    const namedMatch = line.match(EXPORT_NAMED_RE);
    if (namedMatch) {
      const kindMap: Record<string, ParsedExport['kind']> = {
        function: 'function',
        class: 'class',
        const: 'variable',
        let: 'variable',
        var: 'variable',
        type: 'type',
        interface: 'type',
        enum: 'type',
      };
      exports.push({ name: namedMatch[2], kind: kindMap[namedMatch[1]] || 'unknown', line: lineNum });
      continue;
    }

    // Check destructured exports: export { a, b, c }
    const destructureMatch = line.match(EXPORT_DESTRUCTURE_RE);
    if (destructureMatch) {
      const names = destructureMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim());
      for (const name of names) {
        if (name) exports.push({ name, kind: 'unknown', line: lineNum });
      }
      continue;
    }

    // Dynamic imports: import('...')
    const dynRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
    let dynMatch;
    while ((dynMatch = dynRe.exec(line)) !== null) {
      imports.push({ source: dynMatch[1], line: lineNum });
    }
  }

  return { imports, exports, lineCount };
}

/**
 * Strip single-line (//) and multi-line comments, preserving line structure.
 */
function stripComments(content: string): string {
  let result = '';
  let i = 0;
  let inString: string | null = null; // track quote character
  let inTemplate = false;

  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];

    // Handle string literals (don't strip inside strings)
    if (!inString && !inTemplate && (ch === '"' || ch === "'")) {
      inString = ch;
      result += ch;
      i++;
      continue;
    }
    if (inString && ch === inString && content[i - 1] !== '\\') {
      inString = null;
      result += ch;
      i++;
      continue;
    }
    if (inString) {
      result += ch;
      i++;
      continue;
    }

    // Template literals
    if (!inTemplate && ch === '`') {
      inTemplate = true;
      result += ch;
      i++;
      continue;
    }
    if (inTemplate && ch === '`' && content[i - 1] !== '\\') {
      inTemplate = false;
      result += ch;
      i++;
      continue;
    }
    if (inTemplate) {
      result += ch;
      i++;
      continue;
    }

    // Single-line comment
    if (ch === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }

    // Multi-line comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < content.length - 1 && !(content[i] === '*' && content[i + 1] === '/')) {
        if (content[i] === '\n') result += '\n'; // preserve line count
        i++;
      }
      i += 2; // skip */
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Join multi-line import/export statements into single lines.
 * Handles: import {\n  foo,\n  bar\n} from './mod'
 */
function joinMultiLineStatements(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let buffer = '';
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (buffer) {
      buffer += ' ' + trimmed;
      braceDepth += countChar(trimmed, '{') - countChar(trimmed, '}');
      if (braceDepth <= 0 || trimmed.includes("from ") || trimmed.includes("from\t")) {
        result.push(buffer);
        buffer = '';
        braceDepth = 0;
      }
      continue;
    }

    // Detect start of multi-line import/export
    if (/^\s*(import|export)\s/.test(trimmed)) {
      const opens = countChar(trimmed, '{');
      const closes = countChar(trimmed, '}');
      if (opens > closes && !trimmed.match(/['"][^'"]+['"]/)) {
        // Unclosed brace and no string literal (source) yet → multi-line
        buffer = trimmed;
        braceDepth = opens - closes;
        continue;
      }
    }

    result.push(line);
  }

  // Flush any remaining buffer
  if (buffer) result.push(buffer);

  return result.join('\n');
}

function countChar(str: string, ch: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ch) count++;
  }
  return count;
}
