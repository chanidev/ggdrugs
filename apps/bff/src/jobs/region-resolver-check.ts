// apps/bff/src/jobs/region-resolver-check.ts
/**
 * resolver eval — extractKoreanRegion / resolveRegionId 케이스 검증.
 *
 * 사용: `pnpm --filter bff exec tsx src/jobs/region-resolver-check.ts`
 * exit 0: 모든 케이스 통과 / exit 1: 1건 이상 실패.
 *
 * BFF 패키지에 test framework 가 없어 본 스크립트가 단위 테스트 역할.
 */
import { prisma } from '../prisma.js';
import { extractKoreanRegion, resolveRegionId } from './ingest-common.js';

interface ExtractCase {
  addr: string | null;
  expect: { sido: string; sigungu: string | null } | null;
}

const EXTRACT_CASES: ExtractCase[] = [
  // 서울 — 기존 동작 유지
  { addr: '서울특별시 종로구 세종로 175', expect: { sido: '서울', sigungu: '종로구' } },
  { addr: '서울 강남구 테헤란로 152', expect: { sido: '서울', sigungu: '강남구' } },
  { addr: '서울특별시 마포구', expect: { sido: '서울', sigungu: '마포구' } },
  // 광역시 자치구
  { addr: '부산광역시 해운대구 우동', expect: { sido: '부산', sigungu: '해운대구' } },
  { addr: '광주 동구 충장로', expect: { sido: '광주', sigungu: '동구' } },
  { addr: '대전광역시 유성구 대학로', expect: { sido: '대전', sigungu: '유성구' } },
  // 일반시·군
  { addr: '강원특별자치도 강릉시 경강로', expect: { sido: '강원', sigungu: '강릉시' } },
  { addr: '경상남도 통영시 도남동', expect: { sido: '경남', sigungu: '통영시' } },
  { addr: '전북특별자치도 부안군', expect: { sido: '전북', sigungu: '부안군' } },
  // 자치구 있는 일반시 — 합성형
  { addr: '경기도 수원시 영통구 광교중앙로', expect: { sido: '경기', sigungu: '수원시 영통구' } },
  { addr: '경기도 성남시 분당구 정자동', expect: { sido: '경기', sigungu: '성남시 분당구' } },
  { addr: '충청북도 청주시 흥덕구 사직동', expect: { sido: '충북', sigungu: '청주시 흥덕구' } },
  { addr: '경상남도 창원시 마산합포구', expect: { sido: '경남', sigungu: '창원시 마산합포구' } },
  // 자치구 있는 시인데 자치구 명시 없음 → sigungu 가 시 본체
  { addr: '경기도 수원시 권선동', expect: { sido: '경기', sigungu: '수원시' } },
  { addr: '경기도 성남시', expect: { sido: '경기', sigungu: '성남시' } },
  // 광역만 — sigungu null
  { addr: '경기도', expect: { sido: '경기', sigungu: null } },
  { addr: '제주특별자치도', expect: { sido: '제주', sigungu: null } },
  // 세종 — sigungu 없는 광역
  { addr: '세종특별자치시 한누리대로', expect: { sido: '세종', sigungu: null } },
  // 매칭 실패
  { addr: null, expect: null },
  { addr: '', expect: null },
  { addr: '서울시', expect: { sido: '서울', sigungu: null } }, // 모호한 표기 — sido 만 인식
  { addr: '강원도 평창군', expect: { sido: '강원', sigungu: '평창군' } }, // 구버전 표기
];

interface ResolveCase {
  addr: string;
  expectQuery: { sido: string; sigungu: string | null };
}

const RESOLVE_CASES: ResolveCase[] = [
  { addr: '서울 종로구', expectQuery: { sido: '서울', sigungu: '종로구' } },
  { addr: '부산 해운대구', expectQuery: { sido: '부산', sigungu: '해운대구' } },
  { addr: '경기 수원시 영통구', expectQuery: { sido: '경기', sigungu: '수원시 영통구' } },
  // 합성형 사양인데 sigungu 매칭 실패 → 시 단위 fallback
  { addr: '경기 수원시 어딘가동', expectQuery: { sido: '경기', sigungu: '수원시' } },
  // sigungu 없음 → 광역 row
  { addr: '제주특별자치도', expectQuery: { sido: '제주', sigungu: null } },
];

let pass = 0;
let fail = 0;

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  console.log('=== extractKoreanRegion ===');
  for (const c of EXTRACT_CASES) {
    const got = extractKoreanRegion(c.addr);
    if (eq(got, c.expect)) {
      pass++;
      console.log(`  PASS  ${JSON.stringify(c.addr)} → ${JSON.stringify(got)}`);
    } else {
      fail++;
      console.error(`  FAIL  ${JSON.stringify(c.addr)} expected ${JSON.stringify(c.expect)} got ${JSON.stringify(got)}`);
    }
  }

  console.log('\n=== resolveRegionId (DB) ===');
  for (const c of RESOLVE_CASES) {
    const regionId = await resolveRegionId(c.addr);
    if (regionId === null) {
      fail++;
      console.error(`  FAIL  ${c.addr} → null (regions row missing?)`);
      continue;
    }
    const row = await prisma.region.findUnique({ where: { regionId }, select: { sidoName: true, sigunguName: true } });
    if (!row) {
      fail++;
      console.error(`  FAIL  ${c.addr} → orphan regionId ${regionId}`);
      continue;
    }
    if (row.sidoName === c.expectQuery.sido && row.sigunguName === c.expectQuery.sigungu) {
      pass++;
      console.log(`  PASS  ${c.addr} → ${row.sidoName}/${row.sigunguName ?? 'NULL'} (${regionId})`);
    } else {
      fail++;
      console.error(`  FAIL  ${c.addr} expected ${c.expectQuery.sido}/${c.expectQuery.sigungu ?? 'NULL'} got ${row.sidoName}/${row.sigunguName ?? 'NULL'}`);
    }
  }

  await prisma.$disconnect();
  console.log(`\nTotal: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
