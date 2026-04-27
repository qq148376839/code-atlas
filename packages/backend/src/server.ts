import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { projectRoutes } from './routes/projects.js';
import { moduleRoutes } from './routes/modules.js';
import { treeRoutes } from './routes/tree.js';
import { closeDb } from './db/index.js';

const app = Fastify({ logger: true });

// CORS: configurable origin whitelist
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : true; // dev mode: allow all
await app.register(cors, { origin: corsOrigin });

// Global error handler for Zod validation errors
app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
  if (error instanceof ZodError) {
    const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    return reply.status(400).send({ error: '输入验证失败', details: messages });
  }
  app.log.error(error);
  const statusCode = error.statusCode || 500;
  return reply.status(statusCode).send({
    error: statusCode < 500 ? error.message : '服务器内部错误',
  });
});

// Register routes
await app.register(projectRoutes);
await app.register(moduleRoutes);
await app.register(treeRoutes);

// Health check
app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Graceful shutdown
const shutdown = async () => {
  closeDb();
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
  console.log(`code-atlas backend running on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
