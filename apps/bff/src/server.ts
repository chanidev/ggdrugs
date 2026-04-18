import { createApp } from './app.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { env } from './env.js';
import { startScheduler } from './jobs/scheduler.js';

const PORT = 3000;
const app = createApp();

const server = app.listen(PORT, () => {
  logger.info(
    { port: PORT, nodeEnv: env.NODE_ENV },
    `BFF listening on http://localhost:${PORT}`,
  );
  startScheduler();
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown requested');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
