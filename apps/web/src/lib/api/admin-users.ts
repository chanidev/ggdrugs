import { BFF_URL, withCredentials } from './client.js';
import type { UploaderApprovalStatus } from './uploader.js';

// =============================================================
// ADR 0005 E-7 (정정): Members 탭 — 회원/admin 관리.
// =============================================================

export type AdminScope = 'full' | 'content_only' | 'uploader_review_only' | 'security';
export type MemberRoleFilter = 'all' | 'general' | 'uploader' | 'admin';
export type MemberStatusFilter = 'all' | 'active' | 'deleted';

export interface AdminUserListItem {
  userId: string;
  nickname: string;
  authProvider: string;
  activeRole: string;
  isDeleted: boolean;
  createdAt: string;
  lastLoggedInAt: string | null;
  uploader: { uploaderId: string; approvalStatus: UploaderApprovalStatus } | null;
  admin: { adminId: string; scope: AdminScope; isActive: boolean } | null;
}

export interface AdminUsersListResponse {
  page: number;
  limit: number;
  total: number;
  byRole: Record<MemberRoleFilter, number>;
  byStatus: Record<'active' | 'deleted', number>;
  items: AdminUserListItem[];
}

export async function fetchAdminUsers(
  query: {
    role?: MemberRoleFilter;
    status?: MemberStatusFilter;
    q?: string;
    page?: number;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<AdminUsersListResponse> {
  const sp = new URLSearchParams();
  if (query.role) sp.set('role', query.role);
  if (query.status) sp.set('status', query.status);
  if (query.q && query.q.trim().length > 0) sp.set('q', query.q.trim());
  if (query.page) sp.set('page', String(query.page));
  if (query.limit) sp.set('limit', String(query.limit));
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/admin/users?${sp.toString()}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`GET /admin/users ${res.status}`);
  return (await res.json()) as AdminUsersListResponse;
}

export interface AdminUserAuditEntry {
  auditId: string;
  adminId: string;
  adminNickname: string;
  action: string;
  payload: unknown;
  createdAt: string;
}

export interface AdminUserDetail {
  user: {
    userId: string;
    nickname: string;
    authProvider: string;
    socialUid: string;
    activeRole: string;
    isDeleted: boolean;
    deletedAt: string | null;
    createdAt: string;
    lastLoggedInAt: string | null;
  };
  uploader: {
    uploaderId: string;
    approvalStatus: UploaderApprovalStatus;
    approvedAt: string | null;
    organizationName: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  admin: {
    adminId: string;
    scope: AdminScope;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  activeSessionCount: number;
  recentAudits: AdminUserAuditEntry[];
}

export async function fetchAdminUser(
  userId: string,
  signal?: AbortSignal,
): Promise<AdminUserDetail> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/admin/users/${encodeURIComponent(userId)}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('USER_NOT_FOUND');
  if (!res.ok) throw new Error(`GET /admin/users/${userId} ${res.status}`);
  return (await res.json()) as AdminUserDetail;
}

interface MutationOk { auditId: string }

async function adminUserMutation(
  url: string,
  method: 'POST' | 'PUT',
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(
    url,
    withCredentials({
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`FORBIDDEN:${data.error ?? 'unknown'}`);
  }
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`CONFLICT:${data.error ?? 'unknown'}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${method} ${url} ${res.status}: ${txt.slice(0, 200)}`);
  }
  return await res.json();
}

export async function promoteUserToAdmin(
  userId: string,
  scope: AdminScope,
  reason: string,
): Promise<MutationOk & { adminId: string; scope: AdminScope; isActive: boolean }> {
  return (await adminUserMutation(
    `${BFF_URL}/admin/users/${encodeURIComponent(userId)}/promote`,
    'POST',
    { scope, reason },
  )) as MutationOk & { adminId: string; scope: AdminScope; isActive: boolean };
}

export async function demoteUserAdmin(
  userId: string,
  reason: string,
): Promise<MutationOk> {
  return (await adminUserMutation(
    `${BFF_URL}/admin/users/${encodeURIComponent(userId)}/demote`,
    'POST',
    { reason },
  )) as MutationOk;
}

export async function changeUserAdminScope(
  userId: string,
  scope: AdminScope,
  reason: string,
): Promise<MutationOk & { scope: AdminScope }> {
  return (await adminUserMutation(
    `${BFF_URL}/admin/users/${encodeURIComponent(userId)}/admin-scope`,
    'PUT',
    { scope, reason },
  )) as MutationOk & { scope: AdminScope };
}

export async function softDeleteUserAccount(
  userId: string,
  reason: string,
): Promise<MutationOk & { deletedSessionCount: number }> {
  return (await adminUserMutation(
    `${BFF_URL}/admin/users/${encodeURIComponent(userId)}/soft-delete`,
    'POST',
    { reason },
  )) as MutationOk & { deletedSessionCount: number };
}

export async function revokeUserSessionsByAdmin(
  userId: string,
  reason: string,
): Promise<MutationOk & { deletedSessions: number }> {
  return (await adminUserMutation(
    `${BFF_URL}/admin/users/${encodeURIComponent(userId)}/revoke-sessions`,
    'POST',
    { reason },
  )) as MutationOk & { deletedSessions: number };
}
