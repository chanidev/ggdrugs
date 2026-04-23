import { BFF_URL, withCredentials } from './client.js';
import type { EventPhase } from './events.js';

// =============================================================
// Admin — A_700 part 2: 업로더 승급 심사 (shared status enum)
// =============================================================

export type UploaderApprovalStatus =
  | 'pending'
  | 'approved'
  | 'revision_requested'
  | 'rejected';

// =============================================================
// Uploader self — A_600 / A_601 / A_602
// =============================================================

export interface MyUploaderProfile {
  uploaderId: string;
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  approvalStatus: UploaderApprovalStatus;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** rejected 재신청 쿨다운 (7d). cooldownReason: 'rejected_cooldown' | 'profile_exists' | null. */
  canReapply: boolean;
  canReapplyAt: string | null;
  cooldownReason: 'rejected_cooldown' | 'profile_exists' | null;
}

/** 본인 업로더 프로파일 조회. 프로파일 없으면 null. */
export async function fetchMyUploader(
  signal?: AbortSignal,
): Promise<MyUploaderProfile | null> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/uploader`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /me/uploader ${res.status}`);
  const data = (await res.json()) as { uploader: MyUploaderProfile };
  return data.uploader;
}

export interface UploaderSignupDocumentMeta {
  key: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface ApplyUploaderBody {
  organizationName: string;
  contactPhone: string;
  contactEmail: string;
  realName: string;
  /** 기관 업로더. ciHash 와 XOR. 10자리 숫자. */
  businessRegistrationNumber?: string | null;
  /** 개인 업로더. businessRegistrationNumber 와 XOR. 88자 Base64. */
  ciHash?: string | null;
  documents: UploaderSignupDocumentMeta[];
}

export async function requestUploaderSignupDocumentUploadUrl(body: {
  contentType: string;
  sizeBytes: number;
}): Promise<DocumentUploadUrlResponse> {
  const res = await fetch(
    `${BFF_URL}/me/uploader/documents/upload-url`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `POST /me/uploader/documents/upload-url ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as DocumentUploadUrlResponse;
}

export async function applyUploader(body: ApplyUploaderBody): Promise<{
  uploader: MyUploaderProfile;
  resubmitted?: boolean;
}> {
  const res = await fetch(
    `${BFF_URL}/me/uploader/apply`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    throw new Error(`ALREADY_APPLIED:${data.status ?? 'unknown'}`);
  }
  if (res.status === 429) {
    // rejected 재신청 쿨다운 — canReapplyAt ISO + cooldownDays 동봉.
    const data = (await res.json().catch(() => ({}))) as {
      canReapplyAt?: string;
      cooldownDays?: number;
    };
    throw new Error(
      `REAPPLY_COOLDOWN:${data.canReapplyAt ?? ''}:${data.cooldownDays ?? '?'}`,
    );
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /me/uploader/apply ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as {
    uploader: MyUploaderProfile;
    resubmitted?: boolean;
  };
}

/** user ↔ uploader 역할 토글. uploader 전환은 approved 이어야 함. */
export async function setActiveRole(
  role: 'user' | 'uploader',
): Promise<{ activeRole: 'user' | 'uploader' }> {
  const res = await fetch(
    `${BFF_URL}/me/active-role`,
    withCredentials({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) {
    const data = (await res.json().catch(() => ({}))) as { status?: string };
    throw new Error(`UPLOADER_NOT_APPROVED:${data.status ?? 'unknown'}`);
  }
  if (!res.ok) throw new Error(`PUT /me/active-role ${res.status}`);
  return (await res.json()) as { activeRole: 'user' | 'uploader' };
}

export interface MyUploaderEventItem {
  eventId: string;
  title: string;
  phase: EventPhase;
  approvalStatus: UploaderApprovalStatus;
  startDate: string;
  endDate: string;
  posterImageUrl: string | null;
  createdAt: string;
  category: { code: string; name: string };
  region: { regionId: string; sido: string; sigungu: string | null };
  /** 최신 관리자 심사 로그 — rejected/revision_requested 일 때 사유 표시. */
  latestDecision: {
    action: 'approved' | 'revision_requested' | 'rejected';
    reason: string | null;
    decidedAt: string;
  } | null;
}

export interface MyUploaderEventsResponse {
  page: number;
  limit: number;
  total: number;
  byStatus: Record<UploaderApprovalStatus, number>;
  items: MyUploaderEventItem[];
}

export async function fetchMyUploaderEvents(
  query: {
    approvalStatus?: UploaderApprovalStatus | 'any';
    phase?: EventPhase[];
    page?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<MyUploaderEventsResponse> {
  const sp = new URLSearchParams();
  if (query.approvalStatus) sp.set('approvalStatus', query.approvalStatus);
  if (query.phase?.length) sp.set('phase', query.phase.join(','));
  if (query.page) sp.set('page', String(query.page));
  if (query.limit) sp.set('limit', String(query.limit));
  const qs = sp.toString();
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/uploader/events${qs ? `?${qs}` : ''}`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`GET /me/uploader/events ${res.status}`);
  return (await res.json()) as MyUploaderEventsResponse;
}

export interface UploaderDocumentMeta {
  key: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export type NewUploaderEventBody = {
  title: string;
  categoryCode: string;
  regionId: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  addressDetail?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  operatingHours?: string | null;
  targetAudience?: string | null;
  admissionFee?: string | null;
  expectedCompanionPrimary?: 'family' | 'friend' | 'couple' | 'solo' | null;
  expectedCompanionSecondary?: 'family' | 'friend' | 'couple' | 'solo' | null;
  posterImageUrl?: string | null;
  approvalDocuments: UploaderDocumentMeta[];
};

export interface CreatedUploaderEvent {
  eventId: string;
  title: string;
  approvalStatus: UploaderApprovalStatus;
  phase: EventPhase;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface PosterUploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  maxBytes: number;
}

export interface DocumentUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxBytes: number;
}

export async function requestDocumentUploadUrl(body: {
  contentType: string;
  sizeBytes: number;
}): Promise<DocumentUploadUrlResponse> {
  const res = await fetch(
    `${BFF_URL}/uploader/documents/upload-url`,
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
      `POST /uploader/documents/upload-url ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as DocumentUploadUrlResponse;
}

export async function requestPosterUploadUrl(body: {
  contentType: string;
  sizeBytes: number;
}): Promise<PosterUploadUrlResponse> {
  const res = await fetch(
    `${BFF_URL}/uploader/events/poster-upload-url`,
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
      `POST /uploader/events/poster-upload-url ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  return (await res.json()) as PosterUploadUrlResponse;
}

/** presigned URL 로 바로 PUT. BFF 거치지 않음 (Content-Type 헤더 일치해야 서명 유효). */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PUT S3 ${res.status}: ${txt.slice(0, 200)}`);
  }
}

export async function createUploaderEvent(
  body: NewUploaderEventBody,
): Promise<CreatedUploaderEvent> {
  const res = await fetch(
    `${BFF_URL}/uploader/events`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`FORBIDDEN:${data.error ?? 'unknown'}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /uploader/events ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { event: CreatedUploaderEvent };
  return data.event;
}

// =============================================================
// A_601b — 업로더 이벤트 수정 재제출 (revision_requested / rejected)
// =============================================================

export interface UploaderEventDocumentPreview {
  documentId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  /** 5분짜리 presigned GET URL */
  previewUrl: string;
}

export interface UploaderEventDetail {
  eventId: string;
  title: string;
  categoryCode: string;
  regionId: string;
  regionLabel: string;
  description: string | null;
  startDate: string;
  endDate: string;
  addressDetail: string | null;
  latitude: string | null;
  longitude: string | null;
  operatingHours: string | null;
  targetAudience: string | null;
  admissionFee: string | null;
  expectedCompanionPrimary: 'family' | 'friend' | 'couple' | 'solo' | null;
  expectedCompanionSecondary: 'family' | 'friend' | 'couple' | 'solo' | null;
  posterImageUrl: string | null;
  approvalStatus: UploaderApprovalStatus;
  phase: EventPhase;
  createdAt: string;
  updatedAt: string;
  documents: UploaderEventDocumentPreview[];
  latestDecision: {
    action: string;
    reason: string | null;
    decidedAt: string;
  } | null;
}

export async function fetchUploaderEvent(
  eventId: string,
  signal?: AbortSignal,
): Promise<UploaderEventDetail> {
  const init: RequestInit = { method: 'GET' };
  if (signal) init.signal = signal;
  const res = await fetch(`${BFF_URL}/uploader/events/${encodeURIComponent(eventId)}`, withCredentials(init));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET /uploader/events/${eventId} ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { event: UploaderEventDetail };
  return data.event;
}

export type UpdateUploaderEventBody = {
  title: string;
  categoryCode: string;
  regionId: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  addressDetail?: string | null;
  operatingHours?: string | null;
  targetAudience?: string | null;
  admissionFee?: string | null;
  expectedCompanionPrimary?: 'family' | 'friend' | 'couple' | 'solo' | null;
  expectedCompanionSecondary?: 'family' | 'friend' | 'couple' | 'solo' | null;
  /** 새 포스터 URL. 있으면 교체. undefined = 유지, clearPoster=true 와 병행 불가. */
  posterImageUrl?: string | null;
  /** true 면 기존 포스터 제거. posterImageUrl 과 병행 X. */
  clearPoster?: boolean;
  /** 제공 시 서류 전체 교체. 미제공 시 기존 유지. */
  approvalDocuments?: UploaderDocumentMeta[];
};

export interface UpdatedUploaderEvent {
  eventId: string;
  approvalStatus: UploaderApprovalStatus;
  phase: EventPhase;
  resubmitted: true;
}

export async function updateUploaderEvent(
  eventId: string,
  body: UpdateUploaderEventBody,
): Promise<UpdatedUploaderEvent> {
  const res = await fetch(
    `${BFF_URL}/uploader/events/${encodeURIComponent(eventId)}`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
    throw new Error(`NOT_EDITABLE:${data.status ?? 'unknown'}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PATCH /uploader/events/${eventId} ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as UpdatedUploaderEvent;
}
