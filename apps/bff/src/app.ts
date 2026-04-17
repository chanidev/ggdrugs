import express, { type Express, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { env } from './env.js';

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

  return app;
}
