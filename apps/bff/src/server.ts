import { createApp } from './app.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { env } from './env.js';
import { startScheduler } from './jobs/scheduler.js';
import { startChatScheduler } from './jobs/chat-scheduler.js';
import { createSocketServer } from './lib/socket-server.js';
import { closeRedisClient } from './lib/redis-client.js';

const PORT = 3000;
const app = createApp();

// app.listen() 반환값(http.Server) 에 Socket.IO 를 attach (ADR 0007 결정6 R-01).
// createSocketServer 는 listen 직후 — httpServer ref 가 확정된 뒤 호출.
const httpServer = app.listen(PORT, () => {
  logger.info(
    { port: PORT, nodeEnv: env.NODE_ENV },
    `BFF listening on http://localhost:${PORT}`,
  );
  startScheduler();
});

// Socket.IO attach — httpServer 에 직접 바인딩 (createApp() 변경 없음)
createSocketServer(httpServer);

// 채팅 타임아웃 스케줄러 — startScheduler() 와 독립 호출 (ADR 0007 결정10 / BFF REST 격리 원칙).
// ingest API 키 유무와 무관하게 가동. startScheduler() early-return 과 격리.
startChatScheduler();

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown requested');
  httpServer.close();
  await closeRedisClient();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
