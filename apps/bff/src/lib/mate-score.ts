/**
 * mate-score.ts — 순수 룰 기반 양방향 매칭 점수 엔진 (Task 3 / ADR 0007)
 *
 * 규칙:
 *   - LLM / Qdrant import 금지 (금지 #4)
 *   - 미사용 변수 선언 금지 (noUnusedLocals)
 *   - 하드필터: 선호(null=상관없음)가 있고 상대 속성과 불일치 → null (후보 제외)
 *   - 소프트 점수: 일치/근접 항목 가중 합산
 */

export interface MateAttrs {
  gender: string;
  ageRangeLower: number;
  regionId: bigint | null;
  hasCar: boolean;
  nationality: string;
  koreanOk: boolean;
}

export interface MatePrefs {
  prefGender: string | null;
  prefAgeLower: number | null;
  prefRegionId: bigint | null;
  prefHasCar: boolean | null;
  prefNationality: string | null;
  prefKoreanOk: boolean | null;
}

// 연령대 밴드 허용 오차: 두 하한 값의 차이가 이 이상이면 하드필터 제외.
const AGE_BAND_TOLERANCE = 10; // 5세 단위 2칸 = 10

/**
 * 단방향 적합 점수.
 * prefs 기준으로 attrs 가 얼마나 맞는지 0~100 범위 합산값 반환.
 * 하드필터 불일치 시 null 반환 (후보 제외).
 *
 * null 선호 = 상관없음 → 해당 항목 필터 건너뜀.
 */
export function scoreOneWay(prefs: MatePrefs, attrs: MateAttrs): number | null {
  let score = 0;

  // ── 하드필터 ─────────────────────────────────────────────────
  // gender: 선호 있고 불일치 → 제외
  if (prefs.prefGender !== null && prefs.prefGender !== attrs.gender) {
    return null;
  }

  // 연령대: 선호 있고 밴드 초과 → 제외
  if (prefs.prefAgeLower !== null) {
    const ageDiff = Math.abs(prefs.prefAgeLower - attrs.ageRangeLower);
    if (ageDiff > AGE_BAND_TOLERANCE) {
      return null;
    }
    // 소프트: 가까울수록 가점 (최대 20점)
    score += Math.max(0, 20 - ageDiff * 2);
  }

  // 지역: 선호 있고 불일치 → 제외 (슬라이스2 경계: 지역 기반. 슬라이스3에서 이벤트 연결)
  if (prefs.prefRegionId !== null && prefs.prefRegionId !== attrs.regionId) {
    return null;
  }

  // hasCar: 선호 있고 불일치 → 제외
  if (prefs.prefHasCar !== null && prefs.prefHasCar !== attrs.hasCar) {
    return null;
  }

  // 국적: 선호 있고 불일치 → 제외
  if (prefs.prefNationality !== null && prefs.prefNationality !== attrs.nationality) {
    return null;
  }

  // 한국어: 선호 있고 불일치 → 제외
  if (prefs.prefKoreanOk !== null && prefs.prefKoreanOk !== attrs.koreanOk) {
    return null;
  }

  // ── 소프트 점수 (하드 통과 후) ─────────────────────────────────
  // gender 일치 가점
  if (prefs.prefGender !== null && prefs.prefGender === attrs.gender) {
    score += 20;
  }

  // 지역 일치 가점
  if (prefs.prefRegionId !== null && prefs.prefRegionId === attrs.regionId) {
    score += 20;
  }

  // 국적 일치 가점
  if (prefs.prefNationality !== null && prefs.prefNationality === attrs.nationality) {
    score += 15;
  }

  // 한국어 일치 가점
  if (prefs.prefKoreanOk !== null && prefs.prefKoreanOk === attrs.koreanOk) {
    score += 10;
  }

  // 자차 일치 가점
  if (prefs.prefHasCar !== null && prefs.prefHasCar === attrs.hasCar) {
    score += 15;
  }

  return score;
}

/**
 * 양방향 점수.
 * a 기준 b 적합 AND b 기준 a 적합 둘 다 통과해야 후보.
 * 두 단방향 점수 합산 반환 (null = 어느 한 쪽이라도 하드필터 불일치).
 */
export function bidirectionalScore(
  a: { attrs: MateAttrs; prefs: MatePrefs },
  b: { attrs: MateAttrs; prefs: MatePrefs },
): number | null {
  const aToB = scoreOneWay(a.prefs, b.attrs);
  if (aToB === null) return null;

  const bToA = scoreOneWay(b.prefs, a.attrs);
  if (bToA === null) return null;

  return aToB + bToA;
}
