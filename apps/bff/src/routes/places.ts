import type { Request, Response } from 'express';
import { logger } from '../logger.js';

// =============================================================
// GET /places/search?q=<keyword>&limit=<N>
//
// v4.9 (2026-04-26) — Kakao Places 키워드 검색 proxy. distance sort 의 anchor
// 후보를 사용자가 자연어 keyword 로 찾을 수 있게.
//
// Web → BFF → Kakao Local API. REST API 키는 server-only (KAKAO_REST_API_KEY).
//
// Web 측은 fetchPlaces() 로 호출, 결과 클릭 시 (lng, lat) 추출 후 anchor 로 적용.
// =============================================================

const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

interface KakaoKeywordDoc {
  place_name: string;
  address_name: string;
  road_address_name?: string;
  category_name?: string;
  x: string; // lng
  y: string; // lat
}

interface KakaoKeywordResponse {
  documents: KakaoKeywordDoc[];
  meta?: { total_count?: number; is_end?: boolean };
}

export interface PlaceItem {
  name: string;
  address: string;
  /** 도로명 주소 — 있으면 노출 (없으면 address). */
  roadAddress?: string;
  category?: string;
  lng: number;
  lat: number;
}

export async function searchPlaces(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) {
    res.status(400).json({ error: 'q (>= 2 chars) required' });
    return;
  }
  const limit = (() => {
    const n = Number.parseInt(typeof req.query.limit === 'string' ? req.query.limit : '', 10);
    if (!Number.isFinite(n)) return 5;
    return Math.min(Math.max(n, 1), 15);
  })();

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'KAKAO_REST_API_KEY not configured' });
    return;
  }

  const url = new URL(KAKAO_KEYWORD_URL);
  url.searchParams.set('query', q);
  url.searchParams.set('size', String(limit));

  let upstream: Response;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });
    upstream = r as unknown as Response;
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      logger.warn({ status: r.status, body: txt.slice(0, 200) }, 'kakao places upstream non-ok');
      res.status(502).json({ error: 'upstream_kakao_places', status: r.status });
      return;
    }
    const data = (await r.json()) as KakaoKeywordResponse;
    const items: PlaceItem[] = (data.documents ?? [])
      .map((d) => {
        const lng = Number.parseFloat(d.x);
        const lat = Number.parseFloat(d.y);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
          name: d.place_name,
          address: d.address_name,
          ...(d.road_address_name ? { roadAddress: d.road_address_name } : {}),
          ...(d.category_name ? { category: d.category_name } : {}),
          lng,
          lat,
        } satisfies PlaceItem;
      })
      .filter((x): x is PlaceItem => x !== null);
    res.json({ items, total: data.meta?.total_count ?? items.length });
  } catch (err) {
    logger.warn({ err }, 'places search failed');
    res.status(502).json({ error: 'upstream_kakao_places' });
  }
}
