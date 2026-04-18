import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { env } from './env.js';
import { listEvents } from './routes/events.js';
import { eventsStats } from './routes/events-stats.js';
import { getEventDetail } from './routes/event-detail.js';
import { listRegions, listVibes } from './routes/lookups.js';

// CORS — dev 전용 origin: env.WEB_URL (기본 http://localhost:5173).
// Vite proxy 쓰는 경우에도 무해 (Origin 헤더 없으면 그대로 통과).
const ALLOWED_ORIGINS = new Set<string>([env.WEB_URL]);
logger.info({ allowedOrigins: [...ALLOWED_ORIGINS] }, 'CORS allowed origins');

function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] ?? 'Content-Type,Authorization',
    );
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

export function createApp(): Express {
  const app = express();

  app.use(cors);
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
  app.get('/events/stats', (req: Request, res: Response, next: NextFunction) => {
    eventsStats(req, res).catch(next);
  });
  app.get('/events/:id', (req: Request, res: Response, next: NextFunction) => {
    getEventDetail(req, res).catch(next);
  });
  app.get('/regions', (req: Request, res: Response, next: NextFunction) => {
    listRegions(req, res).catch(next);
  });
  app.get('/vibes', (req: Request, res: Response, next: NextFunction) => {
    listVibes(req, res).catch(next);
  });

  // Error handler — 일관된 JSON 에러 응답
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const msg = err instanceof Error ? err.message : 'internal error';
    req.log?.error({ err }, 'unhandled error');
    if (!res.headersSent) res.status(500).json({ error: msg });
  });

  return app;
}
