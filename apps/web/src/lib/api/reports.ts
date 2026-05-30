/**
 * reports.ts — 신고 + 차단 API 클라이언트 (GG-REPORT-001~009)
 *
 * createReport   — POST /community/reports           (신고 접수)
 * blockUser      — POST /community/users/:id/block   (일반 차단, GG-008)
 * fetchMyReports — GET  /me/reports                  (내 신고 목록)
 * fetchAdminReports  — GET  /admin/reports            (관리자 신고 목록, GG-004)
 * fetchAdminReport   — GET  /admin/reports/:id        (신고 상세,       GG-005)
 * actionReport       — POST /admin/reports/:id/action (조치 결정,       GG-006/007)
 */

import { BFF_URL, withCredentials } from './client.js';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type ReportTargetType = 'post' | 'comment' | 'chat_message' | 'mate_eval';
export type ReportReason = 'spam' | 'abuse' | 'harassment' | 'obscene' | 'no_show' | 'etc';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
export type ReportAdminAction = 'warned' | 'suspended' | 'false_report' | 'dismissed';

export interface CreateReportBody {
  targetUserId: string;
  targetType: ReportTargetType;
  targetEntityId: string;
  reason: ReportReason;
  detail?: string;
}

export interface ReportItem {
  reportId: string;
  reporterId: string;
  reporterNickname: string;
  targetUserId: string;
  targetUserNickname: string;
  targetType: ReportTargetType;
  targetEntityId: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  adminAction: ReportAdminAction | null;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ReportDetail extends ReportItem {
  adminId: string | null;
  adminNickname: string | null;
  targetUserSanctionStatus: string;
  targetContent: Record<string, unknown> | null;
}

export interface AdminReportsListResponse {
  page: number;
  limit: number;
  total: number;
  byStatus: Record<ReportStatus, number>;
  items: ReportItem[];
}

export interface AdminReportActionBody {
  /** 경고/허위신고/기각 = full|content_only, 이용정지 = full 전용 */
  action: ReportAdminAction;
  note?: string;
  /** action='suspended' 시 필수, 1~365 */
  suspendDays?: number;
}

// ─── 사용자: 신고 접수 (GG-REPORT-001~003) ───────────────────────────────────

export async function createReport(body: CreateReportBody): Promise<{ reportId: string }> {
  const res = await fetch(`${BFF_URL}/community/reports`, withCredentials({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 400) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? 'BAD_REQUEST');
  }
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (res.status === 409) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? 'CONFLICT');
  }
  if (!res.ok) throw new Error('SERVER_ERROR');
  return res.json() as Promise<{ reportId: string }>;
}

// ─── 사용자: 일반 차단 (GG-REPORT-008, 채팅방 없는 surface) ─────────────────

export async function blockUser(targetUserId: string): Promise<{ blockId: string }> {
  const res = await fetch(
    `${BFF_URL}/community/users/${encodeURIComponent(targetUserId)}/block`,
    withCredentials({ method: 'POST' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 400) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? 'BAD_REQUEST');
  }
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (res.status === 409) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? 'ALREADY_BLOCKED');
  }
  if (!res.ok) throw new Error('SERVER_ERROR');
  return res.json() as Promise<{ blockId: string }>;
}

// ─── 사용자: 내 신고 목록 ────────────────────────────────────────────────────

export async function fetchMyReports(
  query: { status?: string; page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<{ items: ReportItem[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.page != null) params.set('page', String(query.page));
  if (query.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  const res = await fetch(
    `${BFF_URL}/me/reports${qs ? `?${qs}` : ''}`,
    withCredentials(signal ? { signal } : {}),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error('SERVER_ERROR');
  return res.json() as Promise<{ items: ReportItem[]; total: number; page: number; limit: number }>;
}

// ─── 관리자: 신고 목록 (GG-REPORT-004) ──────────────────────────────────────

export async function fetchAdminReports(
  query: { status?: string; targetType?: string; page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<AdminReportsListResponse> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.targetType) params.set('targetType', query.targetType);
  if (query.page != null) params.set('page', String(query.page));
  if (query.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  const res = await fetch(
    `${BFF_URL}/admin/reports${qs ? `?${qs}` : ''}`,
    withCredentials(signal ? { signal } : {}),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error('SERVER_ERROR');
  return res.json() as Promise<AdminReportsListResponse>;
}

// ─── 관리자: 신고 상세 (GG-REPORT-005) ──────────────────────────────────────

export async function fetchAdminReport(reportId: string, signal?: AbortSignal): Promise<ReportDetail> {
  const res = await fetch(
    `${BFF_URL}/admin/reports/${encodeURIComponent(reportId)}`,
    withCredentials(signal ? { signal } : {}),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('SERVER_ERROR');
  return res.json() as Promise<ReportDetail>;
}

// ─── 관리자: 조치 결정 (GG-REPORT-006/007) ──────────────────────────────────

export async function actionReport(
  reportId: string,
  body: AdminReportActionBody,
): Promise<{ reportId: string; status: string; adminAction: string | null; auditId: string }> {
  const res = await fetch(
    `${BFF_URL}/admin/reports/${encodeURIComponent(reportId)}/action`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? 'FORBIDDEN');
  }
  if (res.status === 400) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? 'BAD_REQUEST');
  }
  if (res.status === 409) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? 'ALREADY_REVIEWED');
  }
  if (!res.ok) throw new Error('SERVER_ERROR');
  return res.json() as Promise<{ reportId: string; status: string; adminAction: string | null; auditId: string }>;
}
