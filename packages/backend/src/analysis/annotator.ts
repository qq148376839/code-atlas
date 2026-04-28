import { getDb } from '../db/index.js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

interface FileRow {
  id: string;
  path: string;
  line_count: number;
  exports: string;
  imports: string;
  is_manual: number;
}

// ─── Layer 1: Project Summary ───

export function generateProjectSummary(projectId: string, projectRoot: string): void {
  const parts: string[] = [];

  // package.json name + description
  const pkgPath = path.join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.description) parts.push(pkg.description);
      const framework = detectFramework(pkg.dependencies || {}, pkg.devDependencies || {});
      if (framework) parts.push(framework);
    } catch { /* ignore parse errors */ }
  }

  // README first line (skip title)
  const readmePaths = ['README.md', 'readme.md', 'README.MD'];
  for (const rp of readmePaths) {
    const readmePath = path.join(projectRoot, rp);
    if (existsSync(readmePath)) {
      try {
        const lines = readFileSync(readmePath, 'utf-8').split('\n');
        const descLine = lines.find(l => l.trim() && !l.startsWith('#') && !l.startsWith('!'));
        if (descLine) parts.push(descLine.trim().slice(0, 100));
      } catch { /* ignore */ }
      break;
    }
  }

  const summary = parts.join(' — ') || null;
  if (summary) {
    getDb().prepare('UPDATE projects SET summary = ? WHERE id = ?').run(summary, projectId);
  }
}

function detectFramework(deps: Record<string, string>, devDeps: Record<string, string>): string | null {
  const all = { ...deps, ...devDeps };
  if (all['react'] || all['next']) return '前端应用（React）';
  if (all['vue'] || all['nuxt']) return '前端应用（Vue）';
  if (all['svelte']) return '前端应用（Svelte）';
  if (all['hono']) return 'Web 后端（Hono）';
  if (all['fastify']) return 'Web 后端（Fastify）';
  if (all['express']) return 'Web 后端（Express）';
  if (all['koa']) return 'Web 后端（Koa）';
  if (all['electron']) return '桌面应用（Electron）';
  if (all['react-native']) return '移动应用（React Native）';
  return null;
}

// ─── Layer 2: File Descriptions ───

const FILE_NAME_RULES: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /^index\.[^.]+$/, description: '模块入口/导出聚合' },
  { pattern: /^types\.|\.d\.ts$|^interfaces\./, description: '类型定义' },
  { pattern: /^config\.|^constants\.|^env\./, description: '配置与常量' },
  { pattern: /route/, description: '路由/API 端点定义' },
  { pattern: /entry|^main\.|^app\./, description: '应用入口' },
  { pattern: /\.test\.|\.spec\./, description: '测试' },
  { pattern: /middleware/, description: '中间件' },
  { pattern: /service/, description: '业务服务' },
  { pattern: /controller/, description: '请求处理/控制器' },
  { pattern: /model|schema/, description: '数据模型' },
  { pattern: /store|state/, description: '状态管理' },
  { pattern: /^use[A-Z]|hook/, description: 'React Hook' },
  { pattern: /^utils?\.|^helpers?\.|^common\./, description: '工具函数' },
];

const VERB_RULES: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /fetch|request|client/, description: '数据获取' },
  { pattern: /pars[ei]|decode/, description: '解析/解码' },
  { pattern: /merg[ei]|combine/, description: '合并/组合' },
  { pattern: /filter|clean|dedup/, description: '过滤/清洗/去重' },
  { pattern: /auth|login|credential/, description: '认证/凭证管理' },
  { pattern: /cache/, description: '缓存' },
  { pattern: /log|monitor/, description: '日志/监控' },
  { pattern: /speed|perf|bench/, description: '性能测试' },
  { pattern: /scrap[ei]|crawl/, description: '抓取/爬虫' },
  { pattern: /proxy/, description: '代理/转发' },
  { pattern: /encrypt|decrypt|hash|security/, description: '加密/安全' },
  { pattern: /queue|job|worker/, description: '任务队列' },
  { pattern: /validat[ei]|check/, description: '校验/验证' },
  { pattern: /blacklist|whitelist|block/, description: '黑白名单' },
  { pattern: /aggregat/, description: '聚合处理' },
  { pattern: /dashboard|admin/, description: '管理面板' },
  { pattern: /live|stream/, description: '直播/流媒体' },
  { pattern: /search|query|find/, description: '搜索/查询' },
];

function inferFileDescription(fileName: string, exports: string[]): string {
  const lowerName = fileName.toLowerCase();

  // Rule 1: File name pattern match
  for (const rule of FILE_NAME_RULES) {
    if (rule.pattern.test(lowerName)) return rule.description;
  }

  // Rule 2: Export-based inference
  if (exports.length > 0) {
    const allTypes = exports.every(e =>
      /^[A-Z]/.test(e) && !e.endsWith('Html') && !e.startsWith('create')
    );
    if (allTypes && exports.some(e => /Type$|Interface$|Props$|Config$/.test(e))) {
      return '类型定义';
    }
    if (exports.some(e => /Html$|Template$|Page$/.test(e))) return '页面/模板生成';
    if (exports.some(e => /^create|^init|^setup/.test(e))) return '初始化/工厂';
  }

  // Rule 3: Verb-based inference from filename
  for (const rule of VERB_RULES) {
    if (rule.pattern.test(lowerName)) return rule.description;
  }

  // Fallback: list exports
  if (exports.length > 0) {
    const display = exports.slice(0, 3).join(', ');
    return `导出 ${display}${exports.length > 3 ? ` +${exports.length - 3}` : ''}`;
  }

  return '';
}

export function annotateFiles(projectId: string): void {
  const db = getDb();
  const files = db.prepare(
    'SELECT id, path, line_count, exports, imports, is_manual FROM files WHERE project_id = ?'
  ).all(projectId) as FileRow[];

  const update = db.prepare('UPDATE files SET description = ?, role = ? WHERE id = ?');

  for (const file of files) {
    if (file.is_manual) continue; // Don't overwrite manual annotations
    const fileName = path.basename(file.path);
    const exports: string[] = JSON.parse(file.exports || '[]');
    const description = inferFileDescription(fileName, exports);
    const role = 'normal'; // Role computed separately after deps are resolved
    update.run(description, role, file.id);
  }
}

// ─── Layer 3: Role Tags ───

export function computeRoles(projectId: string): void {
  const db = getDb();
  const files = db.prepare(
    'SELECT id, path, line_count, exports, imports, is_manual FROM files WHERE project_id = ?'
  ).all(projectId) as FileRow[];

  // Build in-degree / out-degree map
  const allPaths = new Set(files.map(f => f.path));
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  files.forEach(f => { inDegree.set(f.path, 0); outDegree.set(f.path, 0); });

  for (const file of files) {
    const imports: Array<{ source: string; isExternal: boolean }> = JSON.parse(file.imports || '[]');
    let outCount = 0;
    for (const imp of imports) {
      if (imp.isExternal) continue;
      const resolved = resolveImportForRole(file.path, imp.source, allPaths);
      if (resolved) {
        outCount++;
        inDegree.set(resolved, (inDegree.get(resolved) || 0) + 1);
      }
    }
    outDegree.set(file.path, outCount);
  }

  const update = db.prepare('UPDATE files SET role = ? WHERE id = ?');

  for (const file of files) {
    if (file.is_manual) continue;

    const inD = inDegree.get(file.path) || 0;
    const outD = outDegree.get(file.path) || 0;
    const exports: string[] = JSON.parse(file.exports || '[]');
    const complexity = Math.min(Math.round(file.line_count / 5), 100);

    let role = 'normal';

    // Check type-only files
    const fileName = path.basename(file.path).toLowerCase();
    if (/^types?\.|\.d\.ts$|^interfaces?\./.test(fileName)) {
      role = 'type';
    } else if (/^config\.|^constants?\.|^env\./.test(fileName)) {
      role = 'config';
    } else if (inD === 0 && outD >= 2) {
      role = 'entry';
    } else if (inD >= 5) {
      role = 'hub';
    } else if (complexity >= 60 && inD >= 3) {
      role = 'core';
    } else if (complexity < 30 && outD >= 3) {
      role = 'utility';
    } else if (outD >= 2 && inD === 0) {
      role = 'leaf';
    }

    update.run(role, file.id);
  }
}

function resolveImportForRole(importerPath: string, source: string, allPaths: Set<string>): string | null {
  if (!source.startsWith('.')) return null;
  const dir = path.dirname(importerPath);
  const resolved = path.normalize(path.join(dir, source));
  if (allPaths.has(resolved)) return resolved;
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    if (allPaths.has(resolved + ext)) return resolved + ext;
  }
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    const idx = path.join(resolved, `index${ext}`);
    if (allPaths.has(idx)) return idx;
  }
  return null;
}

// ─── Layer 4: Logical Grouping ───

export function computeGroups(projectId: string): void {
  const db = getDb();
  const files = db.prepare(
    'SELECT path, description, role FROM files WHERE project_id = ?'
  ).all(projectId) as Array<{ path: string; description: string; role: string }>;

  // Group by parent directory
  const dirFiles = new Map<string, Array<{ path: string; description: string; role: string }>>();
  for (const f of files) {
    const dir = path.dirname(f.path);
    if (!dirFiles.has(dir)) dirFiles.set(dir, []);
    dirFiles.get(dir)!.push(f);
  }

  // Clear old groups
  db.prepare('DELETE FROM file_groups WHERE project_id = ?').run(projectId);

  const insert = db.prepare(
    'INSERT INTO file_groups (id, project_id, parent_path, group_name, file_paths) VALUES (?, ?, ?, ?, ?)'
  );

  let groupId = 0;
  for (const [dir, dirFileList] of dirFiles) {
    if (dirFileList.length <= 6) continue; // Only group large directories

    const groups = clusterByPrefix(dirFileList);
    for (const [groupName, paths] of groups) {
      if (paths.length < 2) continue; // Skip single-file groups
      groupId++;
      insert.run(
        `grp-${projectId}-${groupId}`,
        projectId,
        dir,
        groupName,
        JSON.stringify(paths),
      );
    }
  }
}

function clusterByPrefix(files: Array<{ path: string }>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const used = new Set<string>();

  // Extract basenames and find shared prefixes
  const basenames = files.map(f => ({ path: f.path, base: path.basename(f.path, path.extname(f.path)) }));

  // Find prefix clusters (files sharing a common prefix before first - or _)
  const prefixMap = new Map<string, string[]>();
  for (const { path: filePath, base } of basenames) {
    const match = base.match(/^([a-z]+)[-_]/i);
    if (match) {
      const prefix = match[1].toLowerCase();
      if (!prefixMap.has(prefix)) prefixMap.set(prefix, []);
      prefixMap.get(prefix)!.push(filePath);
    }
  }

  for (const [prefix, paths] of prefixMap) {
    if (paths.length >= 2) {
      groups.set(prefix, paths);
      paths.forEach(p => used.add(p));
    }
  }

  return groups;
}

// ─── Layer 5: Impact Analysis (computed on-demand, not stored) ───

export function computeImpact(projectId: string, targetPath: string): { affectedCount: number; riskLevel: string } {
  const db = getDb();
  const files = db.prepare(
    'SELECT path, imports FROM files WHERE project_id = ?'
  ).all(projectId) as Array<{ path: string; imports: string }>;

  const allPaths = new Set(files.map(f => f.path));

  // Build reverse dependency graph: who imports targetPath?
  const dependedBy = new Map<string, Set<string>>();
  for (const f of files) {
    const imports: Array<{ source: string; isExternal: boolean }> = JSON.parse(f.imports || '[]');
    for (const imp of imports) {
      if (imp.isExternal) continue;
      const resolved = resolveImportForRole(f.path, imp.source, allPaths);
      if (resolved) {
        if (!dependedBy.has(resolved)) dependedBy.set(resolved, new Set());
        dependedBy.get(resolved)!.add(f.path);
      }
    }
  }

  // BFS from targetPath through dependedBy chain
  const visited = new Set<string>();
  const queue = [targetPath];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = dependedBy.get(current);
    if (deps) {
      for (const d of deps) {
        if (!visited.has(d)) queue.push(d);
      }
    }
  }

  const affectedCount = visited.size - 1; // Exclude self
  let riskLevel = 'low';
  if (affectedCount >= 10) riskLevel = 'high';
  else if (affectedCount >= 5) riskLevel = 'medium';

  return { affectedCount, riskLevel };
}

// ─── Layer 6: Auto-generate Feature Blocks ───

export function generateFeatureBlocks(projectId: string): void {
  const db = getDb();

  // Don't overwrite manually edited blocks
  const manualBlocks = db.prepare(
    'SELECT id FROM feature_blocks WHERE project_id = ? AND is_auto = 0'
  ).all(projectId);

  // Remove only auto-generated blocks (manual ones stay)
  db.prepare('DELETE FROM feature_blocks WHERE project_id = ? AND is_auto = 1').run(projectId);

  const files = db.prepare(
    'SELECT path, description, role FROM files WHERE project_id = ?'
  ).all(projectId) as Array<{ path: string; description: string; role: string }>;

  if (files.length === 0) return;

  // Strategy 1: Use existing file_groups as seeds
  const groups = db.prepare(
    'SELECT group_name, file_paths FROM file_groups WHERE project_id = ?'
  ).all(projectId) as Array<{ group_name: string; file_paths: string }>;

  const usedPaths = new Set<string>();
  const blocks: Array<{ name: string; description: string; filePaths: string[] }> = [];

  for (const group of groups) {
    const paths: string[] = JSON.parse(group.file_paths);
    if (paths.length < 2) continue;

    // Generate name from group_name + file descriptions
    const descriptions = files
      .filter(f => paths.includes(f.path))
      .map(f => f.description)
      .filter(Boolean);
    const name = group.group_name.charAt(0).toUpperCase() + group.group_name.slice(1);
    const desc = descriptions.length > 0 ? descriptions.slice(0, 2).join('、') : '';

    blocks.push({ name, description: desc, filePaths: paths });
    paths.forEach(p => usedPaths.add(p));
  }

  // Strategy 2: Group ungrouped files by role
  const roleGroups = new Map<string, string[]>();
  for (const file of files) {
    if (usedPaths.has(file.path)) continue;
    const role = file.role || 'normal';
    if (role === 'normal') continue; // Skip normal files — too generic
    if (!roleGroups.has(role)) roleGroups.set(role, []);
    roleGroups.get(role)!.push(file.path);
  }

  const ROLE_NAMES: Record<string, string> = {
    entry: '应用入口',
    config: '配置',
    type: '类型定义',
    utility: '工具函数',
  };

  for (const [role, paths] of roleGroups) {
    if (paths.length < 2) continue;
    const name = ROLE_NAMES[role] || role;
    blocks.push({ name, description: `${name}相关文件`, filePaths: paths });
    paths.forEach(p => usedPaths.add(p));
  }

  // Strategy 3: Remaining ungrouped large files become their own blocks
  const ungrouped = files.filter(f => !usedPaths.has(f.path) && f.description);
  // Only create single-file blocks for important files (entry, core, hub)
  for (const file of ungrouped) {
    if (['entry', 'core', 'hub'].includes(file.role)) {
      blocks.push({
        name: path.basename(file.path, path.extname(file.path)),
        description: file.description || '',
        filePaths: [file.path],
      });
    }
  }

  // Write blocks
  const insert = db.prepare(
    'INSERT INTO feature_blocks (id, project_id, name, description, file_paths, is_auto) VALUES (?, ?, ?, ?, ?, 1)'
  );

  for (const block of blocks) {
    insert.run(
      nanoid(),
      projectId,
      block.name,
      block.description,
      JSON.stringify(block.filePaths),
    );
  }
}

// ─── Main entry: run all annotation layers ───

export function runAnnotation(projectId: string, projectRoot: string): void {
  generateProjectSummary(projectId, projectRoot);
  annotateFiles(projectId);
  computeRoles(projectId);
  computeGroups(projectId);
  generateFeatureBlocks(projectId);
}
