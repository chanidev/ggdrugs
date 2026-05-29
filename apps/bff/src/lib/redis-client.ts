// Redis singleton — Socket.IO adapter pub 클라이언트 + pub/sub 공유.
// sub 클라이언트는 .duplicate()로 adapter 전용으로만 사용 — 재사용 금지.
// ChatRoom 실시간 fan-out 용. LLM ChatSession 과 무관.
import Redis from 'ioredis';
import { env } from '../env.js';
import { logger } from '../logger.js';

let _client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_client) {
    _client = new Redis(env.REDIS_URL);
    _client.on('error', (err) => logger.warn({ err }, 'redis error'));
  }
  return _client;
}

export async function closeRedisClient(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}
