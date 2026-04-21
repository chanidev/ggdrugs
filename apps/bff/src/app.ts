import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { env } from './env.js';
import { listEvents } from './routes/events.js';
import { eventsStats } from './routes/events-stats.js';
import { getEventDetail } from './routes/event-detail.js';
import { listEventReviews, createEventReview, deleteMyReview } from './routes/event-reviews.js';
import { listRegions, listVibes } from './routes/lookups.js';
import {
  devLogin,
  me,
  logout,
  startGoogle,
  googleCallback,
  startKakao,
  kakaoCallback,
} from './routes/auth.js';
import { requireAuth, resolveAuth } from './middleware/require-auth.js';
import { addBookmark, removeBookmark, listMyBookmarks, listMyReviews } from './routes/bookmarks.js';
import { postChat } from './routes/chat.js';
import { listAdminEvents, putAdminEventVibes } from './routes/admin-events.js';
import {
  listAdminUploaders,
  decideUploader,
  decideEventUpload,
} from './routes/admin-uploaders.js';
import {
  getMyUploader,
  applyUploader,
  setActiveRole,
  listMyUploaderEvents,
  createUploaderEvent,
} from './routes/uploader.js';
import { requireAdmin } from './middleware/require-admin.js';
import {
  requireUploaderApproved,
  requireUploaderActive,
} from './middleware/require-uploader.js';

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
  app.get(
    '/events/:id',
    (req: Request, res: Response, next: NextFunction) => {
      resolveAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      getEventDetail(req, res).catch(next);
    },
  );
  app.get('/events/:id/reviews', (req: Request, res: Response, next: NextFunction) => {
    listEventReviews(req, res).catch(next);
  });
  app.post(
    '/events/:id/reviews',
    (req: Request, res: Response, next: NextFunction) => {
      requireAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      createEventReview(req, res).catch(next);
    },
  );
  app.delete(
    '/reviews/:id',
    (req: Request, res: Response, next: NextFunction) => {
      requireAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      deleteMyReview(req, res).catch(next);
    },
  );
  app.post(
    '/events/:id/bookmark',
    (req: Request, res: Response, next: NextFunction) => {
      requireAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      addBookmark(req, res).catch(next);
    },
  );
  app.delete(
    '/events/:id/bookmark',
    (req: Request, res: Response, next: NextFunction) => {
      requireAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      removeBookmark(req, res).catch(next);
    },
  );
  app.get(
    '/me/bookmarks',
    (req: Request, res: Response, next: NextFunction) => {
      requireAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      listMyBookmarks(req, res).catch(next);
    },
  );
  app.get(
    '/me/reviews',
    (req: Request, res: Response, next: NextFunction) => {
      requireAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      listMyReviews(req, res).catch(next);
    },
  );
  app.get('/regions', (req: Request, res: Response, next: NextFunction) => {
    listRegions(req, res).catch(next);
  });
  app.get('/vibes', (req: Request, res: Response, next: NextFunction) => {
    listVibes(req, res).catch(next);
  });

  app.post('/chat', (req: Request, res: Response, next: NextFunction) => {
    postChat(req, res).catch(next);
  });

  // Admin — vibe 라벨 부여 (requireAuth → requireAdmin 체인).
  app.get(
    '/admin/events',
    (req: Request, res: Response, next: NextFunction) => {
      requireAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      requireAdmin(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      listAdminEvents(req, res).catch(next);
    },
  );
  app.put(
    '/admin/events/:id/vibes',
    (req: Request, res: Response, next: NextFunction) => {
      requireAuth(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      requireAdmin(req, res, next).catch(next);
    },
    (req: Request, res: Response, next: NextFunction) => {
      putAdminEventVibes(req, res).catch(next);
    },
  );

  // Admin — 업로더 승급 심사 + 업로드 이벤트 심사 (A_700 part 2)
  app.get(
    '/admin/uploaders',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => requireAdmin(req, res, next).catch(next),
    (req, res, next) => listAdminUploaders(req, res).catch(next),
  );
  app.post(
    '/admin/uploaders/:id/decision',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => requireAdmin(req, res, next).catch(next),
    (req, res, next) => decideUploader(req, res).catch(next),
  );
  app.post(
    '/admin/events/:id/decision',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => requireAdmin(req, res, next).catch(next),
    (req, res, next) => decideEventUpload(req, res).catch(next),
  );

  // Uploader — 본인 프로파일/신청/역할 토글/이벤트 업로드
  app.get(
    '/me/uploader',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => getMyUploader(req, res).catch(next),
  );
  app.post(
    '/me/uploader/apply',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => applyUploader(req, res).catch(next),
  );
  app.put(
    '/me/active-role',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => setActiveRole(req, res).catch(next),
  );
  app.get(
    '/me/uploader/events',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => requireUploaderApproved(req, res, next).catch(next),
    (req, res, next) => listMyUploaderEvents(req, res).catch(next),
  );
  app.post(
    '/uploader/events',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => requireUploaderActive(req, res, next).catch(next),
    (req, res, next) => createUploaderEvent(req, res).catch(next),
  );

  // Auth — Google OAuth (real) + dev-login stub (dev only).
  app.get('/auth/google', (req: Request, res: Response, next: NextFunction) => {
    startGoogle(req, res).catch(next);
  });
  app.get('/auth/google/callback', (req: Request, res: Response, next: NextFunction) => {
    googleCallback(req, res).catch(next);
  });
  app.get('/auth/kakao', (req: Request, res: Response, next: NextFunction) => {
    startKakao(req, res).catch(next);
  });
  app.get('/auth/kakao/callback', (req: Request, res: Response, next: NextFunction) => {
    kakaoCallback(req, res).catch(next);
  });
  app.post('/auth/dev-login', (req: Request, res: Response, next: NextFunction) => {
    devLogin(req, res).catch(next);
  });
  app.get('/auth/me', (req: Request, res: Response, next: NextFunction) => {
    me(req, res).catch(next);
  });
  app.post('/auth/logout', (req: Request, res: Response, next: NextFunction) => {
    logout(req, res).catch(next);
  });

  // Error handler — 일관된 JSON 에러 응답
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const msg = err instanceof Error ? err.message : 'internal error';
    req.log?.error({ err }, 'unhandled error');
    if (!res.headersSent) res.status(500).json({ error: msg });
  });

  return app;
}
