import type { Request, Response } from 'express';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';

interface LlmChatResponse {
  reply: string;
  filters: {
    eventTypes: string[];
    companions: string[];
    periodKey: string | null;
    vibes: string[];
    regionHints: string[];
  };
}

/**
 * POST /chat — services/llm 의 /chat 로 프록시 + regionHints → regionIds 해상도.
 *
 * LLM 은 자연어에서 "강남구" 등을 문자열로만 뽑아줌. BFF 가 regions 테이블을
 * 조회해 sigungu_name 일치하는 regionId 를 붙여서 반환 — 웹은 그대로 지도 필터에
 * 적용 가능. 인증/투명 프록시와 달리 응답 body 는 약간 가공됨 (regionIds 추가).
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

  if (!upstream.ok) {
    const text = await upstream.text();
    res.status(upstream.status).setHeader(
      'Content-Type',
      upstream.headers.get('content-type') ?? 'application/json',
    );
    res.send(text);
    return;
  }

  const data = (await upstream.json()) as LlmChatResponse;
  const hints = data.filters?.regionHints ?? [];
  const vibeNames = data.filters?.vibes ?? [];

  let regionIds: string[] = [];
  if (hints.length > 0) {
    // dongName: null 로 구·시·도 레벨 (district) 만. 동(neighborhood) 레벨 행과
    // sigungu_name 이 겹치는 경우가 있어 필요. lookups.ts listRegions 와 동일 규약.
    const rows = await prisma.region.findMany({
      where: { sigunguName: { in: hints }, dongName: null },
      select: { regionId: true, sigunguName: true },
    });
    regionIds = rows.map((r) => r.regionId.toString());
  }

  let vibeIds: string[] = [];
  if (vibeNames.length > 0) {
    const rows = await prisma.eventVibe.findMany({
      where: { vibeName: { in: vibeNames }, isActive: true },
      select: { vibeId: true, vibeName: true },
    });
    vibeIds = rows.map((r) => r.vibeId.toString());
  }

  res.json({
    reply: data.reply,
    filters: {
      ...data.filters,
      regionIds,
      vibeIds,
    },
  });
}
