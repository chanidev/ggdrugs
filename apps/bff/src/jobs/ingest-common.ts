import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

/**
 * 여러 외부 소스 ingest 가 공유하는 헬퍼.
 *
 *  - resolveRegionId: addr 텍스트에서 서울 구를 추출해 regions 매칭. 실패 시 서울 전체.
 *  - getCategoryId: category_code 캐시 조회.
 *  - upsertCrawledEvent: (crawl_origin, external_source_id) 기준 upsert.
 *  - computePhase: today 기준 upcoming/ongoing/ended.
 */

export type EventCategoryCode = 'festival' | 'expo' | 'symposium' | 'conference';

export interface NormalizedEvent {
  externalSourceId: string;
  crawlOrigin: string;
  categoryCode: EventCategoryCode;
  title: string;
  addressText: string | null;
  latitude: number | null;
  longitude: number | null;
  startDate: Date;
  endDate: Date;
  posterImageUrl: string | null;
}

export function computePhase(start: Date, end: Date): 'upcoming' | 'ongoing' | 'ended' {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (todayUtc < start) return 'upcoming';
  if (todayUtc > end) return 'ended';
  return 'ongoing';
}

/**
 * YYYYMMDD 또는 YYYY-MM-DD 문자열을 UTC midnight Date 로 파싱.
 */
export function parseYmd(s: string | undefined | null): Date | null {
  if (!s) return null;
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length !== 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * 주소 텍스트에서 서울 구 이름 추출. 예: "서울특별시 종로구 ..." → "종로구".
 * 구 이름이 없으면 null (→ 서울 전체로 fallback).
 */
export function extractSeoulGu(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const match = addr.match(/서울(?:특별시)?\s*(\S{1,5}구)/);
  return match ? match[1]! : null;
}

/** 서울이 아닌 지역의 주소면 null (현재 시드 커버리지가 서울만이라 지원 안 함). */
export function isSeoulAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  return /서울(?:특별시)?/.test(addr);
}

/** 서울 sigungu 이름 기반 regions 조회. 실패 시 서울 전체 row. */
export async function resolveSeoulRegionId(addr: string | null | undefined): Promise<bigint | null> {
  const sigungu = extractSeoulGu(addr);
  if (sigungu) {
    const row = await prisma.region.findFirst({
      where: { sidoName: '서울', sigunguName: sigungu, dongName: null },
      select: { regionId: true },
    });
    if (row) return row.regionId;
  }
  const fallback = await prisma.region.findFirst({
    where: { sidoName: '서울', sigunguName: null, dongName: null },
    select: { regionId: true },
  });
  return fallback?.regionId ?? null;
}

const categoryIdCache = new Map<EventCategoryCode, bigint>();

export async function getCategoryId(code: EventCategoryCode): Promise<bigint> {
  const cached = categoryIdCache.get(code);
  if (cached !== undefined) return cached;
  const row = await prisma.eventCategory.findUnique({
    where: { categoryCode: code },
    select: { categoryId: true },
  });
  if (!row) throw new Error(`event_categories 에 '${code}' 행이 없습니다 — seed_master_data 확인`);
  categoryIdCache.set(code, row.categoryId);
  return row.categoryId;
}

export async function upsertCrawledEvent(ev: NormalizedEvent): Promise<void> {
  if (ev.endDate < ev.startDate) throw new Error('endDate < startDate');

  const categoryId = await getCategoryId(ev.categoryCode);
  const regionId = await resolveSeoulRegionId(ev.addressText);
  if (!regionId) throw new Error('region resolution failed');

  const data = {
    categoryId,
    regionId,
    sourceType: 'crawled',
    crawlOrigin: ev.crawlOrigin,
    title: ev.title.slice(0, 200),
    addressDetail: ev.addressText?.slice(0, 255) ?? null,
    latitude:
      ev.latitude !== null && Number.isFinite(ev.latitude)
        ? new Prisma.Decimal(ev.latitude.toFixed(7))
        : null,
    longitude:
      ev.longitude !== null && Number.isFinite(ev.longitude)
        ? new Prisma.Decimal(ev.longitude.toFixed(7))
        : null,
    startDate: ev.startDate,
    endDate: ev.endDate,
    posterImageUrl: ev.posterImageUrl?.slice(0, 500) ?? null,
    approvalStatus: 'approved',
    phase: computePhase(ev.startDate, ev.endDate),
    approvedAt: new Date(),
  } satisfies Omit<Prisma.EventUncheckedCreateInput, 'externalSourceId'>;

  await prisma.event.upsert({
    where: {
      crawlOrigin_externalSourceId: {
        crawlOrigin: ev.crawlOrigin,
        externalSourceId: ev.externalSourceId,
      },
    },
    create: { ...data, externalSourceId: ev.externalSourceId },
    update: {
      title: data.title,
      addressDetail: data.addressDetail,
      latitude: data.latitude,
      longitude: data.longitude,
      startDate: data.startDate,
      endDate: data.endDate,
      posterImageUrl: data.posterImageUrl,
      phase: data.phase,
    },
  });
}

export interface IngestResult {
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
}
