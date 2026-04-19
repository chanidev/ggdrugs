import type { Request, Response } from 'express';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * POST /chat — services/llm 의 /chat 로 투명 프록시.
 *
 * 현재 LLM 서비스는 인증 없음 (BFF 내부망 호출만 기대). 향후 서비스 간 토큰
 * 도입 시 Authorization 헤더 추가. 요청 body 는 그대로 전달.
 */
export async function postChat(req: Request, res: Response) {
  const url = `${env.LLM_SERVICE_URL}/chat`;
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(req.body ?? {}),
    });
  } catch (err) {
    logger.error({ err, url }, 'llm proxy: fetch failed');
    res.status(502).json({ error: 'llm_service_unreachable' });
    return;
  }
  const text = await upstream.text();
  res.status(upstream.status);
  const ct = upstream.headers.get('content-type');
  if (ct) res.setHeader('Content-Type', ct);
  res.send(text);
}
