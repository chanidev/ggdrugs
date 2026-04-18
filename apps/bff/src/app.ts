import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { env } from './env.js';
import { listEvents } from './routes/events.js';

export function createApp(): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req: Request, res: Response) => {
    const checks = { db: false as boolean | string };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch (e) {
      checks.db = e instanceof Error ? e.message : 'unknown error';
    }
    const ok = Object.values(checks).every((v) => v === true);
    res.status(ok ? 200 : 503).json({ ok, checks, env: env.NODE_ENV });
  });

  app.get('/', (_req, res) => {
    res.json({ service: 'ggdrugs-bff', status: 'running' });
  });

  app.get('/events', (req: Request, res: Response, next: NextFunction) => {
    listEvents(req, res).catch(next);
  });

  // Error handler — 일관된 JSON 에러 응답
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const msg = err instanceof Error ? err.message : 'internal error';
    req.log?.error({ err }, 'unhandled error');
    if (!res.headersSent) res.status(500).json({ error: msg });
  });

  return app;
}
