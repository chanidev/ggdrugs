import { BFF_URL, withCredentials } from './client.js';
import type { EventPhase } from './events.js';
import type { UploaderApprovalStatus } from './uploader.js';

// =============================================================
// Admin — A_700 part 2: 업로더 승급 심사
// =============================================================

export interface AdminUploaderItem {
  uploaderId: string;
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  approvalStatus: UploaderApprovalStatus;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    userId: string;
    nickname: string;
    authProvider: string;
    activeRole: string;
  };
}

export interface AdminUploadersResponse {
  page: number;
  limit: number;
  total: number;
  byStatus: Record<UploaderApprovalStatus, number>;
  items: AdminUploaderItem[];
}

export async function fetchAdminUploaders(
  query: {
    status?: UploaderApprovalStatus | 'any';
    page?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<AdminUploadersResponse> {
  const sp = new URLSearchParams();
  if (query.status) sp.set('status', query.status);
  if (query.page) sp.set('page', String(query.page));
  if (query.limit) sp.set('limit', String(query.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/admin/uploaders${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`GET /admin/uploaders ${res.status}`);
  return (await res.json()) as AdminUploadersResponse;
}

export interface AdminEventDocumentItem {
  documentId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  previewUrl: string;
}

export interface AdminEventDocumentsResponse {
  eventId: string;
  sourceType: string;
  expiresIn: number;
  items: AdminEventDocumentItem[];
}

export async function fetchAdminEventDocuments(
  eventId: string,
  signal?: AbortSignal,
): Promise<AdminEventDocumentsResponse> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(
    `${BFF_URL}/admin/events/${encodeURIComponent(eventId)}/documents`,
    init,
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /admin/events/${eventId}/documents ${res.status}`);
  return (await res.json()) as AdminEventDocumentsResponse;
}

export interface AdminUploaderDetailResponse {
  uploader: AdminUploaderItem & {
    user: AdminUploaderItem['user'] & { createdAt: string };
    /** ADR 0003. scope<full 이면 마스킹된 값. */
    realName: string;
    businessRegistrationNumber: string | null;
    ciHash: string | null;
  };
  adminScope: string;
  eventStats: Record<UploaderApprovalStatus, number>;
  recentEvents: Array<{
    eventId: string;
    title: string;
    approvalStatus: UploaderApprovalStatus;
    phase: EventPhase;
    startDate: string;
    endDate: string;
    createdAt: string;
    categoryName: string;
  }>;
  documents: Array<{
    documentId: string;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
    createdAt: string;
    previewUrl: string;
  }>;
  documentsExpiresIn: number;
}

export async function fetchAdminUploaderDetail(
  uploaderId: string,
  signal?: AbortSignal,
): Promise<AdminUploaderDetailResponse> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(
    `${BFF_URL}/admin/uploaders/${encodeURIComponent(uploaderId)}`,
    init,
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /admin/uploaders/${uploaderId} ${res.status}`);
  return (await res.json()) as AdminUploaderDetailResponse;
}

/**
 * ADR 0005 E-8: reason 은 optional 0~2000자. 빈 문자열은 BFF 가 null 로 저장.
 * 응답의 auditId 는 admin_audit_logs.audit_id (action='uploader_decision').
 */
export async function decideAdminUploader(
  uploaderId: string,
  action: 'approved' | 'revision_requested' | 'rejected',
  reason?: string,
): Promise<{
  uploaderId: string;
  approvalStatus: UploaderApprovalStatus;
  approvedAt: string | null;
  updatedAt: string;
  auditId: string;
}> {
  const body: { action: typeof action; reason?: string } = { action };
  if (reason !== undefined && reason.trim().length > 0) {
    body.reason = reason;
  }
  const res = await fetch(
    `${BFF_URL}/admin/uploaders/${encodeURIComponent(uploaderId)}/decision`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /admin/uploaders/${uploaderId}/decision ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as {
    uploaderId: string;
    approvalStatus: UploaderApprovalStatus;
    approvedAt: string | null;
    updatedAt: string;
    auditId: string;
  };
}
