import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// A_700c — 관리자 감사 로그
// =============================================================

export interface AdminAuditLogItem {
  logId: string;
  eventId: string;
  eventTitle: string;
  eventAvailable: boolean;
  eventCurrentStatus: string | null;
  organizationName: string | null;
  adminId: string;
  adminNickname: string;
  action: 'approved' | 'revision_requested' | 'rejected';
  reason: string | null;
  createdAt: string;
}

export interface AdminAuditLogResponse {
  page: number;
  limit: number;
  total: number;
  byAction: { approved: number; revision_requested: number; rejected: number };
  items: AdminAuditLogItem[];
}

export async function fetchAdminAuditLogs(
  q: { page?: number; limit?: number; action?: 'any' | 'approved' | 'revision_requested' | 'rejected'; eventId?: string; adminId?: string },
  signal?: AbortSignal,
): Promise<AdminAuditLogResponse> {
  const params = new URLSearchParams();
  if (q.page) params.set('page', String(q.page));
  if (q.limit) params.set('limit', String(q.limit));
  if (q.action && q.action !== 'any') params.set('action', q.action);
  if (q.eventId) params.set('eventId', q.eventId);
  if (q.adminId) params.set('adminId', q.adminId);
  const init: RequestInit = { method: 'GET' };
  if (signal) init.signal = signal;
  const res = await fetch(`${BFF_URL}/admin/audit-logs?${params.toString()}`, withCredentials(init));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET /admin/audit-logs ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as AdminAuditLogResponse;
}

// ADR 0005 후속: admin_audit_logs (admin 보안·운영 액션) 별도 조회.
export type AdminAuditAdminAction =
  | 'revoke_sessions'
  | 'admin_promote'
  | 'admin_demote'
  | 'admin_scope_change'
  | 'user_soft_delete'
  | 'uploader_decision';

export interface AdminAuditAdminLogItem {
  auditId: string;
  adminId: string;
  adminNickname: string;
  action: AdminAuditAdminAction;
  targetId: string | null;
  targetNickname: string | null;
  targetDeleted: boolean | null;
  payload: unknown;
  createdAt: string;
}

export interface AdminAuditAdminLogResponse {
  page: number;
  limit: number;
  total: number;
  byAction: Record<AdminAuditAdminAction, number>;
  items: AdminAuditAdminLogItem[];
}

export async function fetchAdminAuditAdminLogs(
  q: {
    page?: number;
    limit?: number;
    action?: 'any' | AdminAuditAdminAction;
    adminId?: string;
    targetUserId?: string;
  },
  signal?: AbortSignal,
): Promise<AdminAuditAdminLogResponse> {
  const params = new URLSearchParams();
  if (q.page) params.set('page', String(q.page));
  if (q.limit) params.set('limit', String(q.limit));
  if (q.action && q.action !== 'any') params.set('action', q.action);
  if (q.adminId) params.set('adminId', q.adminId);
  if (q.targetUserId) params.set('targetUserId', q.targetUserId);
  const init: RequestInit = { method: 'GET' };
  if (signal) init.signal = signal;
  const res = await fetch(
    `${BFF_URL}/admin/admin-audit-logs?${params.toString()}`,
    withCredentials(init),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET /admin/admin-audit-logs ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as AdminAuditAdminLogResponse;
}

// =============================================================
// Dashboard summary — 양 source 통합 카운트 + 최근 활동.
// =============================================================

export interface AuditRecentActivity {
  source: 'event' | 'admin';
  key: string;
  action: string;
  label: string;
  adminNickname: string;
  reason: string | null;
  createdAt: string;
}

export interface AdminAuditSummary {
  window: { days: number; since: string; until: string };
  eventActions: { approved: number; revision_requested: number; rejected: number };
  adminActions: Record<AdminAuditAdminAction, number>;
  recentActivity: AuditRecentActivity[];
}

export async function fetchAdminAuditSummary(
  windowDays = 7,
  signal?: AbortSignal,
): Promise<AdminAuditSummary> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(
    `${BFF_URL}/admin/audit-summary?windowDays=${windowDays}`,
    init,
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`GET /admin/audit-summary ${res.status}`);
  return (await res.json()) as AdminAuditSummary;
}
