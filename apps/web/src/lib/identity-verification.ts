/**
 * 본인인증 인터페이스 — Phase 2 prod swap 지점.
 *
 * 현재: dev stub. crypto.getRandomValues 로 88자 Base64 random CI hash 생성.
 * Prod (ADR 0003 §개인 업로더 본인인증 후속):
 *   1. KYC provider (PASS / NICE / Kakao) popup 또는 redirect 띄움
 *   2. user 가 provider 사이트에서 인증 완료
 *   3. provider callback 으로 CI 수신
 *   4. CI 검증 후 동일 shape `{ ciHash, provider }` 반환
 *
 * Swap 시 본 파일의 함수 본체만 교체. ApplyForm 등 호출 사이트 무수정.
 */

export type KycProvider = 'pass' | 'nice' | 'kakao';

export const KYC_PROVIDERS: { id: KycProvider; label: string }[] = [
  { id: 'pass', label: 'PASS' },
  { id: 'nice', label: 'NICE' },
  { id: 'kakao', label: '카카오 본인인증' },
];

/**
 * Phase 2 prod 통합 시 false 로. UI 가 'dev stub' 마커 노출 여부 결정.
 */
export const IS_KYC_DEV_MOCK = true;

export interface IdentityVerificationResult {
  ciHash: string;
  provider: KycProvider;
}

/**
 * 본인인증 요청.
 *
 * Dev: 약간의 지연 (실제 KYC popup 흐름과 비슷한 UX) + random CI 88자 반환.
 * Prod: 위 §주석 §1~4 흐름으로 교체.
 *
 * 실패 시 throw — 호출자 catch 책임.
 */
export async function requestIdentityVerification(
  provider: KycProvider,
): Promise<IdentityVerificationResult> {
  if (typeof crypto === 'undefined' || !('getRandomValues' in crypto)) {
    throw new Error('crypto.getRandomValues unavailable');
  }

  // 실제 KYC 도 0.5~수초 소요. UX 안정성 위해 dev 도 약간 지연.
  await new Promise((resolve) => setTimeout(resolve, 400));

  const bytes = new Uint8Array(66); // 66 bytes → 88 Base64 char
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const ciHash = btoa(bin).slice(0, 88);

  return { ciHash, provider };
}
