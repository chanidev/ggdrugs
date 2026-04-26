import { BFF_URL, withCredentials } from './client.js';

/**
 * v4.9 — Kakao Places 키워드 검색 (BFF proxy). distance sort 의 anchor 후보로 활용.
 * REST API 키는 BFF 가 보유, Web 은 BFF 만 호출.
 */

export interface PlaceItem {
  name: string;
  address: string;
  roadAddress?: string;
  category?: string;
  lng: number;
  lat: number;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<{ items: PlaceItem[]; total: number }> {
  const q = query.trim();
  if (q.length < 2) return { items: [], total: 0 };
  const url = `${BFF_URL}/places/search?q=${encodeURIComponent(q)}&limit=8`;
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(url, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET /places/search ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as { items: PlaceItem[]; total: number };
}
