import { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';

export async function moduleRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/projects/:id/modules - List modules
  app.get('/api/projects/:id/modules', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const modules = db.prepare(`
      SELECT id, name, path, file_count, line_count, complexity_score
      FROM modules WHERE project_id = ? ORDER BY line_count DESC
    `).all(id);

    return modules.map((m: any) => ({
      id: m.id,
      name: m.name,
      path: m.path,
      fileCount: m.file_count,
      lineCount: m.line_count,
      complexityScore: m.complexity_score,
    }));
  });

  // GET /api/projects/:id/modules/:moduleId - Module detail
  app.get('/api/projects/:id/modules/:moduleId', async (request, reply) => {
    const { id, moduleId } = request.params as { id: string; moduleId: string };
    const db = getDb();

    const module = db.prepare(`
      SELECT id, name, path, file_count, line_count, complexity_score
      FROM modules WHERE id = ? AND project_id = ?
    `).get(moduleId, id) as any;

    if (!module) return reply.status(404).send({ error: 'Module not found' });

    const files = db.prepare(`
      SELECT path, language, line_count, exports, imports
      FROM files WHERE module_id = ? ORDER BY line_count DESC
    `).all(moduleId);

    // Get dependencies (outgoing)
    const dependsOn = db.prepare(`
      SELECT m.name as targetModule, d.weight
      FROM dependencies d
      JOIN modules m ON m.id = d.target_module_id
      WHERE d.source_module_id = ?
      ORDER BY d.weight DESC
    `).all(moduleId);

    // Get dependents (incoming)
    const dependedBy = db.prepare(`
      SELECT m.name as sourceModule, d.weight
      FROM dependencies d
      JOIN modules m ON m.id = d.source_module_id
      WHERE d.target_module_id = ?
      ORDER BY d.weight DESC
    `).all(moduleId);

    return {
      id: module.id,
      name: module.name,
      path: module.path,
      fileCount: module.file_count,
      lineCount: module.line_count,
      complexityScore: module.complexity_score,
      files: files.map((f: any) => ({
        path: f.path,
        language: f.language,
        lineCount: f.line_count,
        exports: JSON.parse(f.exports || '[]'),
        imports: JSON.parse(f.imports || '[]'),
      })),
      dependsOn,
      dependedBy,
    };
  });

  // GET /api/projects/:id/dependencies - Dependency graph
  app.get('/api/projects/:id/dependencies', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const modules = db.prepare(`
      SELECT id, name, path, file_count, line_count, complexity_score
      FROM modules WHERE project_id = ?
    `).all(id);

    const deps = db.prepare(`
      SELECT source_module_id, target_module_id, weight
      FROM dependencies WHERE project_id = ?
    `).all(id);

    return {
      nodes: modules.map((m: any) => ({
        id: m.id,
        name: m.name,
        path: m.path,
        fileCount: m.file_count,
        lineCount: m.line_count,
        complexityScore: m.complexity_score,
      })),
      edges: deps.map((d: any) => ({
        source: d.source_module_id,
        target: d.target_module_id,
        weight: d.weight,
      })),
    };
  });
}
