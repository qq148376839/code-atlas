import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';

const annotateSchema = z.object({
  path: z.string().min(1),
  description: z.string().min(1).max(200),
});

export async function annotateRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/projects/:id/annotate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = annotateSchema.parse(request.body);
    const db = getDb();

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Try to update file first
    const fileResult = db.prepare(
      'UPDATE files SET description = ?, is_manual = 1 WHERE project_id = ? AND path = ?'
    ).run(body.description, id, body.path);

    if (fileResult.changes > 0) {
      return { success: true, path: body.path, description: body.description };
    }

    // Try module (directory)
    const moduleResult = db.prepare(
      'UPDATE modules SET description = ? WHERE project_id = ? AND path = ?'
    ).run(body.description, id, body.path);

    if (moduleResult.changes > 0) {
      return { success: true, path: body.path, description: body.description };
    }

    return reply.status(404).send({ error: `Path "${body.path}" not found in project` });
  });
}
