import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { cloneRepo, removeRepo } from '../analysis/git.js';
import { runAnalysis, getScanJob, getProjectScanJob } from '../analysis/index.js';

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  gitUrl: z.string().url(),
  token: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  token: z.string().optional(),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/projects - List all projects with stats
  app.get('/api/projects', async () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        p.id, p.name, p.git_url, p.local_path, p.default_branch,
        p.last_scanned_at, p.scan_error, p.created_at,
        COUNT(DISTINCT m.id) as module_count,
        COALESCE(SUM(m.file_count), 0) as total_files,
        COALESCE(SUM(m.line_count), 0) as total_lines,
        COUNT(DISTINCT d.id) as dependency_count
      FROM projects p
      LEFT JOIN modules m ON m.project_id = p.id
      LEFT JOIN dependencies d ON d.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all() as any[];

    return rows.map((row) => ({
      ...formatProject(row),
      stats: {
        moduleCount: row.module_count,
        totalFiles: row.total_files,
        totalLines: row.total_lines,
        dependencyCount: row.dependency_count,
      },
    }));
  });

  // POST /api/projects - Register new project
  app.post('/api/projects', async (request, reply) => {
    const body = createProjectSchema.parse(request.body);
    const db = getDb();

    // Check name uniqueness
    const existing = db.prepare('SELECT id FROM projects WHERE name = ?').get(body.name);
    if (existing) {
      return reply.status(409).send({ error: `Project "${body.name}" already exists` });
    }

    const id = nanoid();
    const encryptedToken = body.token ? encrypt(body.token) : null;

    // Clone repository
    let localPath: string;
    let defaultBranch: string;
    try {
      const result = await cloneRepo(body.gitUrl, body.name, body.token || null);
      localPath = result.localPath;
      defaultBranch = result.defaultBranch;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clone failed';
      return reply.status(400).send({ error: `Git clone failed: ${message}` });
    }

    // Insert project
    db.prepare(`
      INSERT INTO projects (id, name, git_url, encrypted_token, local_path, default_branch)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, body.name, body.gitUrl, encryptedToken, localPath, defaultBranch);

    // Trigger initial scan
    const jobId = await runAnalysis(id, localPath);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return reply.status(201).send({
      ...formatProject(project),
      scanJob: { id: jobId, status: 'parsing' },
    });
  });

  // GET /api/projects/:id - Project details with stats
  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT m.id) as moduleCount,
        COALESCE(SUM(m.file_count), 0) as totalFiles,
        COALESCE(SUM(m.line_count), 0) as totalLines,
        COUNT(DISTINCT d.id) as dependencyCount
      FROM modules m
      LEFT JOIN dependencies d ON d.project_id = m.project_id
      WHERE m.project_id = ?
    `).get(id) as any;

    return { ...formatProject(project), stats };
  });

  // PATCH /api/projects/:id - Update project
  app.patch('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateProjectSchema.parse(request.body);
    const db = getDb();

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    if (body.name) {
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(body.name, id);
    }
    if (body.token) {
      const encryptedToken = encrypt(body.token);
      db.prepare('UPDATE projects SET encrypted_token = ? WHERE id = ?').run(encryptedToken, id);
    }

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return formatProject(updated);
  });

  // DELETE /api/projects/:id - Delete project
  app.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Remove cloned files
    await removeRepo(project.name);

    // Cascade delete handles modules, files, dependencies
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    return { success: true };
  });

  // POST /api/projects/:id/scan - Trigger re-scan
  app.post('/api/projects/:id/scan', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const token = project.encrypted_token ? decrypt(project.encrypted_token) : null;
    const jobId = await runAnalysis(id, project.local_path, {
      pullFirst: { localPath: project.local_path, token, gitUrl: project.git_url },
    });
    return { jobId, status: 'cloning' };
  });

  // GET /api/projects/:id/scan/status - Scan progress
  app.get('/api/projects/:id/scan/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = getProjectScanJob(id);

    if (!job) {
      return { status: 'idle' };
    }

    return {
      status: job.status,
      filesTotal: job.filesTotal,
      filesParsed: job.filesParsed,
      error: job.error,
    };
  });
}

function formatProject(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    gitUrl: row.git_url,
    localPath: row.local_path,
    defaultBranch: row.default_branch,
    lastScannedAt: row.last_scanned_at,
    scanError: row.scan_error,
    createdAt: row.created_at,
  };
}
