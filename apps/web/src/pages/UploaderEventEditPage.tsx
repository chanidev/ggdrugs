import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Header } from '../layout/Header';
import { Icon } from '../components/Icon';
import { PosterPickerField } from '../components/uploader/PosterPickerField';
import {
  APPROVAL_DOC_MIME,
  DocumentsPickerField,
  type StagedDoc,
} from '../components/uploader/DocumentsPickerField';
import {
  EventFormFields,
  EVENT_FORM_INITIAL,
  Field,
  isEventFormFilled,
  type EventFormState,
} from '../components/uploader/EventFormFields';
import { useCurrentUser } from '../lib/auth-context';
import {
  fetchRegions,
  fetchUploaderEvent,
  setActiveRole,
  updateUploaderEvent,
  type RegionItem,
  type UploaderEventDetail,
  type UpdateUploaderEventBody,
} from '../lib/api';
import { uploadDocuments, uploadPoster } from '../lib/uploads';

/**
 * /uploader/events/:id/edit — A_601b 이벤트 수정 재제출.
 *
 * 진입 조건:
 *   - 로그인 + approved 업로더 + activeRole=uploader
 *   - 본인 소유 이벤트 + approvalStatus ∈ {revision_requested, rejected}
 *
 * 서류는 선택적 교체(비우면 기존 유지). 포스터는 제거·교체·유지 3가지 상태.
 */

const MIN_DOCS = 2;
const MAX_DOCS = 5;

type PosterMode = 'keep' | 'clear' | 'replace';

export function UploaderEventEditPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const { user, loading: authLoading, refresh } = useCurrentUser();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<UploaderEventDetail | null>(null);
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [form, setForm] = useState<EventFormState>(EVENT_FORM_INITIAL);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  // 포스터 상태 — detail 로드 후 초기값 'keep'
  const [posterMode, setPosterMode] = useState<PosterMode>('keep');
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterUploading, setPosterUploading] = useState(false);

  // 서류 상태 — 비어있으면 기존 유지. 하나라도 추가되면 "전체 교체" 모드 진입.
  const [docs, setDocs] = useState<StagedDoc[]>([]);
  const [docsUploading, setDocsUploading] = useState(false);
  const [replaceDocs, setReplaceDocs] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    if (!eventId) {
      setLoadError('invalid event id');
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    Promise.all([fetchUploaderEvent(eventId, ctrl.signal), fetchRegions(ctrl.signal)])
      .then(([e, rs]) => {
        setDetail(e);
        setRegions(rs);
        setForm({
          title: e.title,
          categoryCode: e.categoryCode,
          regionId: e.regionId,
          description: e.description ?? '',
          startDate: e.startDate,
          endDate: e.endDate,
          addressDetail: e.addressDetail ?? '',
          operatingHours: e.operatingHours ?? '',
          targetAudience: e.targetAudience ?? '',
          admissionFee: e.admissionFee ?? '',
          expectedCompanionPrimary: e.expectedCompanionPrimary ?? '',
          expectedCompanionSecondary: e.expectedCompanionSecondary ?? '',
        });
      })
      .catch((err) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : 'unknown');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [authLoading, user, eventId]);

  const editable =
    detail?.approvalStatus === 'revision_requested' || detail?.approvalStatus === 'rejected';

  const activeRoleOk = user?.activeRole === 'uploader';

  const replaceDocsValid = !replaceDocs || (docs.length >= MIN_DOCS && docs.length <= MAX_DOCS);
  const canSubmit = isEventFormFilled(form) && replaceDocsValid;

  const toggleToUploader = async () => {
    setToggling(true);
    try {
      await setActiveRole('uploader');
      await refresh();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'toggle failed');
    } finally {
      setToggling(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting || !detail || !eventId) return;
    setSubmitting(true);
    setSubmitError(null);

    // 포스터 처리
    let newPosterUrl: string | null | undefined = undefined;
    let clearPoster = false;
    if (posterMode === 'clear') {
      clearPoster = true;
    } else if (posterMode === 'replace' && posterFile) {
      setPosterUploading(true);
      try {
        newPosterUrl = await uploadPoster(posterFile);
      } catch (err) {
        setSubmitError(err instanceof Error ? `포스터 업로드 실패: ${err.message}` : '포스터 업로드 실패');
        setSubmitting(false);
        setPosterUploading(false);
        return;
      } finally {
        setPosterUploading(false);
      }
    }

    // 서류 처리
    let uploadedDocs: Awaited<ReturnType<typeof uploadDocuments>> | undefined;
    if (replaceDocs) {
      setDocsUploading(true);
      try {
        uploadedDocs = await uploadDocuments(docs.map((d) => d.file));
      } catch (err) {
        setSubmitError(err instanceof Error ? `서류 업로드 실패: ${err.message}` : '서류 업로드 실패');
        setSubmitting(false);
        setDocsUploading(false);
        return;
      } finally {
        setDocsUploading(false);
      }
    }

    try {
      const body: UpdateUploaderEventBody = {
        title: form.title.trim(),
        categoryCode: form.categoryCode,
        regionId: form.regionId,
        description: form.description.trim() || null,
        startDate: form.startDate,
        endDate: form.endDate,
        addressDetail: form.addressDetail.trim() || null,
        operatingHours: form.operatingHours.trim() || null,
        targetAudience: form.targetAudience.trim() || null,
        admissionFee: form.admissionFee.trim() || null,
        expectedCompanionPrimary: form.expectedCompanionPrimary || null,
        expectedCompanionSecondary: form.expectedCompanionSecondary || null,
      };
      if (clearPoster) body.clearPoster = true;
      if (newPosterUrl !== undefined) body.posterImageUrl = newPosterUrl;
      if (uploadedDocs) body.approvalDocuments = uploadedDocs;

      await updateUploaderEvent(eventId, body);
      navigate('/uploader');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'submit failed';
      if (msg.startsWith('NOT_EDITABLE')) {
        setSubmitError('현재 상태에서는 수정할 수 없어요. 최신 상태를 다시 확인해 주세요.');
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header />
      <main className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mb-4">
          <Link
            to="/uploader"
            className="inline-flex items-center gap-1.5 text-[13px] text-(--color-text-muted) hover:text-(--color-accent)"
          >
            <span aria-hidden className="inline-block rotate-180">
              <Icon name="arrow" size={14} />
            </span>
            업로더 콘솔로
          </Link>
        </div>

        <header className="mb-6">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--color-text-subtle)">
            Uploader · A_601b
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">이벤트 수정 재제출</h1>
          <p className="m-0 mt-2 text-[13px] text-(--color-text-muted)">
            관리자 피드백을 반영해 다시 승인 대기로 제출할 수 있어요.
          </p>
        </header>

        {authLoading || loading ? (
          <Box>불러오는 중…</Box>
        ) : !user ? (
          <Box>로그인이 필요해요.</Box>
        ) : loadError ? (
          <Box>
            불러오기 실패: {loadError}
          </Box>
        ) : !detail ? (
          <Box>이벤트를 찾을 수 없어요.</Box>
        ) : !editable ? (
          <Box>
            현재 상태({detail.approvalStatus})에서는 수정할 수 없어요. 업로더 콘솔로 돌아가 상태를 확인해 주세요.
          </Box>
        ) : !activeRoleOk ? (
          <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6">
            <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">업로더 역할로 전환이 필요해요</h2>
            <p className="mt-1 text-[13px] text-(--color-text-muted)">
              수정 폼은 uploader 역할일 때만 활성화돼요.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={toggleToUploader}
                disabled={toggling}
                className="inline-flex h-10 items-center rounded-(--radius-md) bg-(--color-accent) px-4 text-[14px] font-medium text-white hover:bg-(--color-accent-hover) disabled:opacity-40"
              >
                {toggling ? '…' : 'uploader 역할로 전환'}
              </button>
            </div>
          </section>
        ) : (
          <form
            onSubmit={submit}
            className="flex flex-col gap-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6"
          >
            {detail.latestDecision && (
              <aside
                className={`rounded-(--radius-md) border p-3 text-[13px] ${
                  detail.approvalStatus === 'rejected'
                    ? 'border-(--color-error)/30 bg-(--color-error)/5'
                    : 'border-(--color-warning)/30 bg-(--color-warning)/5'
                }`}
              >
                <div
                  className={`mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] ${
                    detail.approvalStatus === 'rejected' ? 'text-(--color-error)' : 'text-(--color-warning)'
                  }`}
                >
                  관리자 사유 · {detail.latestDecision.decidedAt.slice(0, 10)}
                </div>
                <p className="m-0 whitespace-pre-wrap text-(--color-text)">
                  {detail.latestDecision.reason ?? '(사유 없음)'}
                </p>
              </aside>
            )}

            <EventFormFields form={form} setForm={setForm} regions={regions} />

            {/* 포스터 — 유지·제거·교체 */}
            <Field label="포스터 이미지">
              <PosterEditor
                currentUrl={detail.posterImageUrl}
                mode={posterMode}
                onModeChange={setPosterMode}
                file={posterFile}
                onFileChange={setPosterFile}
                uploading={posterUploading}
              />
            </Field>

            {/* 서류 — 기본은 기존 유지, "교체" 토글 시 새 파일 2~5개 필요 */}
            <Field
              label="증빙 서류"
              hint={
                replaceDocs
                  ? `새 파일 ${MIN_DOCS}~${MAX_DOCS}개 업로드. 저장 시 기존 서류는 삭제돼요.`
                  : '기존 서류를 그대로 유지합니다. 교체하려면 아래 버튼을 누르세요.'
              }
            >
              {replaceDocs ? (
                <div className="flex flex-col gap-2">
                  <DocumentsPickerField
                    files={docs}
                    onChange={setDocs}
                    uploading={docsUploading}
                    allowedMime={APPROVAL_DOC_MIME}
                    min={MIN_DOCS}
                    max={MAX_DOCS}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceDocs(false);
                      setDocs([]);
                    }}
                    className="self-start text-[12px] text-(--color-text-subtle) hover:text-(--color-accent)"
                  >
                    교체 취소 (기존 유지)
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <ExistingDocsList documents={detail.documents} />
                  <button
                    type="button"
                    onClick={() => setReplaceDocs(true)}
                    className="inline-flex h-9 w-fit items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:border-(--color-border-hover) hover:text-(--color-text)"
                  >
                    서류 교체
                  </button>
                </div>
              )}
            </Field>

            {submitError && (
              <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-(--color-border) pt-4">
              <p className="m-0 text-[12px] text-(--color-text-subtle)">
                저장 시 상태가 '승인 대기' 로 다시 바뀌어 관리자 심사가 다시 진행됩니다.
              </p>
              <div className="flex gap-2">
                <Link
                  to="/uploader"
                  className="inline-flex h-10 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-4 text-[13px] font-medium text-(--color-text-muted) hover:text-(--color-text)"
                >
                  취소
                </Link>
                <button
                  type="submit"
                  disabled={!canSubmit || submitting}
                  className="inline-flex h-10 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-5 text-[14px] font-medium text-white hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? '제출 중…' : '다시 제출'}
                </button>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center text-[14px] text-(--color-text-muted)">
      {children}
    </div>
  );
}

function PosterEditor({
  currentUrl,
  mode,
  onModeChange,
  file,
  onFileChange,
  uploading,
}: {
  currentUrl: string | null;
  mode: PosterMode;
  onModeChange: (m: PosterMode) => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  uploading: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {mode === 'keep' && (
        <div className="flex items-center gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-3">
          {currentUrl ? (
            <>
              <img
                src={currentUrl}
                alt="기존 포스터"
                className="h-16 w-16 rounded-(--radius-sm) object-cover"
              />
              <span className="flex-1 text-[13px] text-(--color-text-muted)">기존 포스터를 유지합니다.</span>
            </>
          ) : (
            <span className="flex-1 text-[13px] text-(--color-text-muted)">포스터 없음 (유지)</span>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onModeChange('replace')}
              className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text)"
            >
              교체
            </button>
            {currentUrl && (
              <button
                type="button"
                onClick={() => onModeChange('clear')}
                className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-error)/40 bg-(--color-error)/5 px-3 text-[12px] font-medium text-(--color-error) hover:bg-(--color-error)/10"
              >
                제거
              </button>
            )}
          </div>
        </div>
      )}
      {mode === 'replace' && (
        <div className="flex flex-col gap-2">
          <PosterPickerField file={file} onChange={onFileChange} uploading={uploading} />
          <button
            type="button"
            onClick={() => {
              onModeChange('keep');
              onFileChange(null);
            }}
            className="self-start text-[12px] text-(--color-text-subtle) hover:text-(--color-accent)"
          >
            교체 취소 (기존 유지)
          </button>
        </div>
      )}
      {mode === 'clear' && (
        <div className="flex items-center gap-3 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3">
          <span className="flex-1 text-[13px] text-(--color-error)">저장 시 포스터가 제거됩니다.</span>
          <button
            type="button"
            onClick={() => onModeChange('keep')}
            className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[12px] font-medium text-(--color-text-muted) hover:text-(--color-text)"
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}

function ExistingDocsList({ documents }: { documents: UploaderEventDetail['documents'] }) {
  if (documents.length === 0) {
    return <div className="text-[13px] text-(--color-text-subtle)">기존 서류 없음.</div>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {documents.map((d) => (
        <li
          key={d.documentId}
          className="flex items-center gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] text-(--color-text)">
            {d.originalFilename}
          </span>
          <span className="tabular text-[11px] text-(--color-text-subtle)">
            {formatBytes(d.fileSizeBytes)}
          </span>
          <a
            href={d.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-(--color-accent) hover:underline"
          >
            미리보기
          </a>
        </li>
      ))}
    </ul>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
