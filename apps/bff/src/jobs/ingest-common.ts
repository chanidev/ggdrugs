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

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function computePhase(start: Date, end: Date): 'upcoming' | 'ongoing' | 'ended' {
  const today = todayUtcMidnight();
  if (today < start) return 'upcoming';
  if (today > end) return 'ended';
  return 'ongoing';
}

/**
 * Forward-looking 필터: endDate >= 오늘 인 이벤트만 통과 (진행중 + 예정).
 * 이미 종료된 이벤트는 초기 backfill 로 DB 에 보관돼 있고, 이후 재수집 대상에서 제외.
 * 배치 주기적 실행 비용(네트워크 + upsert) 절감 목적.
 */
export function isForwardLooking(startDate: Date, endDate: Date): boolean {
  return endDate >= todayUtcMidnight();
  // startDate 는 필요 없음 — endDate 기준만으로 진행중(start<today<=end) + 예정(start>today) 모두 포함.
}

/** YYYYMMDD 형식의 오늘 날짜 — TourAPI 등 URL 쿼리용. */
export function todayYmd(): string {
  const t = todayUtcMidnight();
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * 날짜 문자열을 UTC midnight Date 로 파싱. 앞쪽 8자리 숫자를 YYYYMMDD 로 간주.
 * 지원 포맷: "20260813", "2026-08-13", "2026-08-13 00:00:00.0", "2026.08.13" 등.
 */
export function parseYmd(s: string | undefined | null): Date | null {
  if (!s) return null;
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
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

/**
 * 크로스-소스 중복 체크: (title, start_date, end_date) 가 동일한 이벤트가
 * 다른 crawl_origin 에 이미 있으면 true.
 *
 * 한계: title 이 공백/기호 하나라도 다르면 못 잡음. Phase 2 에서 normalized_title
 * + pg_trgm similarity 로 강화 예정. 지금은 정확 일치 기준.
 */
async function existsInOtherOrigin(ev: NormalizedEvent): Promise<boolean> {
  const hit = await prisma.event.findFirst({
    where: {
      title: ev.title.slice(0, 200),
      startDate: ev.startDate,
      endDate: ev.endDate,
      crawlOrigin: { not: ev.crawlOrigin },
    },
    select: { eventId: true },
  });
  return hit !== null;
}

export async function upsertCrawledEvent(ev: NormalizedEvent): Promise<void> {
  if (ev.endDate < ev.startDate) throw new Error('endDate < startDate');

  // 크로스-소스 dedup: 다른 소스가 이미 같은 이벤트 등록했으면 skip (먼저 들어온 쪽이 win).
  if (await existsInOtherOrigin(ev)) return;

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
