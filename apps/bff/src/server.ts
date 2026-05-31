import { createApp } from './app.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { env } from './env.js';
import { startScheduler } from './jobs/scheduler.js';
import { startChatScheduler } from './jobs/chat-scheduler.js';
import { createSocketServer, closeSocketServer } from './lib/socket-server.js';
import { closeRedisClient } from './lib/redis-client.js';

const PORT = 3000;
const app = createApp();

// app.listen() 반환값(http.Server) 에 Socket.IO 를 attach (ADR 0007 결정6 R-01).
// startScheduler / startChatScheduler 는 listen 콜백 내에서 호출해 포트 바인딩 완료 후 시작.
const httpServer = app.listen(PORT, () => {
  logger.info(
    { port: PORT, nodeEnv: env.NODE_ENV },
    `BFF listening on http://localhost:${PORT}`,
  );
  startScheduler();

  // 채팅 타임아웃 스케줄러 — startScheduler() 와 독립 호출 (ADR 0007 결정10 / BFF REST 격리 원칙).
  // ingest API 키 유무와 무관하게 가동. startScheduler() early-return 과 격리.
  // listen 콜백 내부에서 호출해 createSocketServer(httpServer) 이후 getSocketServer() 사용 보장.
  startChatScheduler();
});

// Socket.IO attach — httpServer 에 직접 바인딩 (createApp() 변경 없음).
// listen 콜백보다 먼저 실행되므로 startChatScheduler() 의 첫 tick 전 초기화 완료.
createSocketServer(httpServer);

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown requested');
  // 1. HTTP 신규 연결 중단
  httpServer.close();
  // 2. Socket.IO io.close() + subClient.quit() — pubClient(closeRedisClient) 이전에 처리
  await closeSocketServer();
  // 3. Redis pub 클라이언트 종료
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
