/**
 * 공유 헬퍼 — 업로더 라우트 모듈 내부에서만 사용.
 *
 * - trimStr: apply / events 양쪽에서 body 정제용으로 사용.
 * - shapeUploaderProfile: profile.ts (getMyUploader) 와 apply.ts (applyUploader) 양쪽 응답 직렬화.
 * - computeReapplyGate / REJECTED_REAPPLY_COOLDOWN_MS: rejected 재신청 쿨다운 게이트 (lint queue #3).
 *
 * computeReapplyGate / REJECTED_REAPPLY_COOLDOWN_MS 는 외부 (e.g. tests) 에서 import 가능하도록
 * `./index.js` barrel 에서 재노출된다.
 */

export function trimStr(raw: unknown, max: number): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s.slice(0, max);
}

/**
 * rejected 재신청 쿨다운 — 7일 (lint queue #3).
 * 기준 시점: uploader_profiles.updatedAt (admin 의 decideUploader 호출 시 갱신).
 * revision_requested 는 admin 이 명시 보완을 요청한 케이스라 쿨다운 없음.
 */
export const REJECTED_REAPPLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function computeReapplyGate(p: {
  approvalStatus: string;
  updatedAt: Date;
}): { canReapply: boolean; canReapplyAt: string | null; cooldownReason: string | null } {
  if (p.approvalStatus === 'rejected') {
    const ready = new Date(p.updatedAt.getTime() + REJECTED_REAPPLY_COOLDOWN_MS);
    if (ready > new Date()) {
      return {
        canReapply: false,
        canReapplyAt: ready.toISOString(),
        cooldownReason: 'rejected_cooldown',
      };
    }
    return { canReapply: true, canReapplyAt: null, cooldownReason: null };
  }
  if (p.approvalStatus === 'revision_requested') {
    return { canReapply: true, canReapplyAt: null, cooldownReason: null };
  }
  // pending / approved — 재신청 자체가 허용 안 됨 (재신청과 무관, applyUploader 가 차단).
  return { canReapply: false, canReapplyAt: null, cooldownReason: 'profile_exists' };
}

export function shapeUploaderProfile(p: {
  uploaderId: bigint;
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  approvalStatus: string;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const gate = computeReapplyGate(p);
  return {
    uploaderId: p.uploaderId.toString(),
    organizationName: p.organizationName,
    contactPhone: p.contactPhone,
    contactEmail: p.contactEmail,
    approvalStatus: p.approvalStatus,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    canReapply: gate.canReapply,
    canReapplyAt: gate.canReapplyAt,
    cooldownReason: gate.cooldownReason,
  };
}
