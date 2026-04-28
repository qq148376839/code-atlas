import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import path from 'node:path';

const createBlockSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  filePaths: z.array(z.string()).min(1).max(20),
});

const updateBlockSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(200).optional(),
  filePaths: z.array(z.string()).min(1).max(20).optional(),
});

export async function blockRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/projects/:id/blocks
  app.get('/api/projects/:id/blocks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const blocks = db.prepare(
      'SELECT id, name, description, file_paths, is_auto, created_at FROM feature_blocks WHERE project_id = ? ORDER BY created_at'
    ).all(id) as any[];

    return blocks.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      filePaths: JSON.parse(b.file_paths || '[]'),
      isAuto: b.is_auto === 1,
      createdAt: b.created_at,
    }));
  });

  // POST /api/projects/:id/blocks
  app.post('/api/projects/:id/blocks', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const body = createBlockSchema.parse(request.body);
    const db = getDb();

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const blockId = nanoid();
    db.prepare(
      'INSERT INTO feature_blocks (id, project_id, name, description, file_paths, is_auto) VALUES (?, ?, ?, ?, ?, 0)'
    ).run(blockId, projectId, body.name, body.description || '', JSON.stringify(body.filePaths));

    return reply.status(201).send({
      id: blockId,
      name: body.name,
      description: body.description || '',
      filePaths: body.filePaths,
      isAuto: false,
    });
  });

  // PATCH /api/projects/:id/blocks/:blockId
  app.patch('/api/projects/:id/blocks/:blockId', async (request, reply) => {
    const { id: projectId, blockId } = request.params as { id: string; blockId: string };
    const body = updateBlockSchema.parse(request.body);
    const db = getDb();

    const block = db.prepare('SELECT id FROM feature_blocks WHERE id = ? AND project_id = ?').get(blockId, projectId);
    if (!block) return reply.status(404).send({ error: 'Block not found' });

    if (body.name) db.prepare('UPDATE feature_blocks SET name = ? WHERE id = ?').run(body.name, blockId);
    if (body.description !== undefined) db.prepare('UPDATE feature_blocks SET description = ? WHERE id = ?').run(body.description, blockId);
    if (body.filePaths) db.prepare('UPDATE feature_blocks SET file_paths = ? WHERE id = ?').run(JSON.stringify(body.filePaths), blockId);
    db.prepare('UPDATE feature_blocks SET is_auto = 0 WHERE id = ?').run(blockId);

    const updated = db.prepare('SELECT * FROM feature_blocks WHERE id = ?').get(blockId) as any;
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      filePaths: JSON.parse(updated.file_paths || '[]'),
      isAuto: false,
    };
  });

  // DELETE /api/projects/:id/blocks/:blockId
  app.delete('/api/projects/:id/blocks/:blockId', async (request, reply) => {
    const { id: projectId, blockId } = request.params as { id: string; blockId: string };
    const db = getDb();

    const result = db.prepare('DELETE FROM feature_blocks WHERE id = ? AND project_id = ?').run(blockId, projectId);
    if (result.changes === 0) return reply.status(404).send({ error: 'Block not found' });
    return { success: true };
  });

  // GET /api/projects/:id/blocks/:blockId/prompt
  app.get('/api/projects/:id/blocks/:blockId/prompt', async (request, reply) => {
    const { id: projectId, blockId } = request.params as { id: string; blockId: string };
    const db = getDb();

    const block = db.prepare('SELECT * FROM feature_blocks WHERE id = ? AND project_id = ?').get(blockId, projectId) as any;
    if (!block) return reply.status(404).send({ error: 'Block not found' });

    const filePaths: string[] = JSON.parse(block.file_paths || '[]');
    const blockFileSet = new Set(filePaths);

    // Get file details
    const allFiles = db.prepare(
      'SELECT path, line_count, description, role, imports FROM files WHERE project_id = ?'
    ).all(projectId) as any[];

    const blockFiles = allFiles.filter(f => blockFileSet.has(f.path));
    const allFilePaths = new Set(allFiles.map(f => f.path));

    // Compute upstream (files this block imports from outside)
    const upstream = new Map<string, number>();
    // Compute downstream (files outside that import from this block)
    const downstream = new Map<string, number>();

    for (const file of blockFiles) {
      const imports: Array<{ source: string; isExternal: boolean }> = JSON.parse(file.imports || '[]');
      for (const imp of imports) {
        if (imp.isExternal) continue;
        const resolved = resolveImportPath(file.path, imp.source, allFilePaths);
        if (resolved && !blockFileSet.has(resolved)) {
          upstream.set(resolved, (upstream.get(resolved) || 0) + 1);
        }
      }
    }

    for (const file of allFiles) {
      if (blockFileSet.has(file.path)) continue;
      const imports: Array<{ source: string; isExternal: boolean }> = JSON.parse(file.imports || '[]');
      for (const imp of imports) {
        if (imp.isExternal) continue;
        const resolved = resolveImportPath(file.path, imp.source, allFilePaths);
        if (resolved && blockFileSet.has(resolved)) {
          downstream.set(file.path, (downstream.get(file.path) || 0) + 1);
        }
      }
    }

    // Get directory for constraint
    const dirs = new Set(filePaths.map(p => path.dirname(p)));
    const primaryDir = [...dirs].sort((a, b) => filePaths.filter(p => p.startsWith(a)).length - filePaths.filter(p => p.startsWith(b)).length).pop() || '';

    // Build prompt
    let prompt = `## 功能模块：${block.name}\n`;
    if (block.description) prompt += `${block.description}\n`;
    prompt += `\n### 涉及文件（共 ${filePaths.length} 个）\n`;
    for (const fp of filePaths) {
      const f = blockFiles.find(bf => bf.path === fp);
      const desc = f?.description ? ` — ${f.description}` : '';
      const role = f?.role && f.role !== 'normal' ? ` [${f.role}]` : '';
      prompt += `- ${fp} (${f?.line_count || '?'}行)${role}${desc}\n`;
    }

    if (upstream.size > 0) {
      prompt += `\n### 上游依赖（本功能使用的外部模块）\n`;
      for (const [filePath, count] of [...upstream.entries()].sort((a, b) => b[1] - a[1])) {
        const f = allFiles.find(af => af.path === filePath);
        const desc = f?.description ? ` — ${f.description}` : '';
        prompt += `- ${filePath}${desc} (引用 ${count} 次)\n`;
      }
    }

    if (downstream.size > 0) {
      prompt += `\n### 下游影响（依赖本功能的外部模块）\n`;
      for (const [filePath, count] of [...downstream.entries()].sort((a, b) => b[1] - a[1])) {
        const f = allFiles.find(af => af.path === filePath);
        const desc = f?.description ? ` — ${f.description}` : '';
        prompt += `- ${filePath}${desc} (依赖 ${count} 处)\n`;
      }
    }

    prompt += `\n### 开发约束\n`;
    prompt += `- 修改范围限定在以上 ${filePaths.length} 个文件内\n`;
    prompt += `- 不要创建新文件实现已有功能\n`;
    if (primaryDir) prompt += `- 如需新增文件，放在 ${primaryDir}/ 目录下\n`;
    if (downstream.size > 0) prompt += `- 改动后注意检查下游 ${downstream.size} 个依赖文件\n`;

    return { prompt, blockName: block.name, fileCount: filePaths.length };
  });
}

function resolveImportPath(importerPath: string, source: string, allPaths: Set<string>): string | null {
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
