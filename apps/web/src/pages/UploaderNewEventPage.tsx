import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Header } from '../layout/Header';
import { Icon } from '../components/Icon';
import { PosterPickerField } from '../components/uploader/PosterPickerField';
import {
  APPROVAL_DOC_MIME,
  DocumentsPickerField,
  type StagedDoc,
} from '../components/uploader/DocumentsPickerField';
import { useCurrentUser } from '../lib/auth-context';
import {
  createUploaderEvent,
  fetchMyUploader,
  fetchRegions,
  setActiveRole,
  type MyUploaderProfile,
  type NewUploaderEventBody,
  type RegionItem,
} from '../lib/api';
import { uploadDocuments, uploadPoster } from '../lib/uploads';

/**
 * /uploader/new — A_602 이벤트 업로드 폼.
 *
 * 전제: 로그인 + approved 업로더 + active_role=uploader.
 *  - 비로그인/미승인 → 안내 + 돌아가기
 *  - approved 인데 active_role!=uploader → 전환 버튼 노출, 전환 후 입력 시작
 *  - 서버 rule: endDate >= startDate, 서울 구 region 권장.
 *
 * 파일 업로드(approval_documents, 포스터 이미지 실파일) 는 다음 패스(MinIO presigned).
 * 현재는 posterImageUrl (외부 URL 입력) 만 받음.
 */

const CATEGORY_OPTIONS: { code: string; label: string }[] = [
  { code: 'festival', label: '축제' },
  { code: 'expo', label: '박람회' },
  { code: 'symposium', label: '심포지움' },
  { code: 'conference', label: '컨퍼런스' },
  { code: 'exhibition', label: '전시' },
  { code: 'performance', label: '공연' },
  { code: 'education', label: '교육' },
  { code: 'movie', label: '영화' },
];

const COMPANION_OPTIONS: { code: 'family' | 'friend' | 'couple' | 'solo'; label: string }[] = [
  { code: 'family', label: '가족' },
  { code: 'friend', label: '친구' },
  { code: 'couple', label: '연인' },
  { code: 'solo', label: '혼자' },
];

type FormState = {
  title: string;
  categoryCode: string;
  regionId: string;
  description: string;
  startDate: string;
  endDate: string;
  addressDetail: string;
  operatingHours: string;
  targetAudience: string;
  admissionFee: string;
  expectedCompanionPrimary: '' | 'family' | 'friend' | 'couple' | 'solo';
  expectedCompanionSecondary: '' | 'family' | 'friend' | 'couple' | 'solo';
  // posterImageUrl 은 file 업로드 후 presigned publicUrl 을 submit 직전 주입. form state 에 없음.
};

const INITIAL: FormState = {
  title: '',
  categoryCode: 'festival',
  regionId: '',
  description: '',
  startDate: '',
  endDate: '',
  addressDetail: '',
  operatingHours: '',
  targetAudience: '',
  admissionFee: '',
  expectedCompanionPrimary: '',
  expectedCompanionSecondary: '',
};

// 서버 검증과 정렬된 수치 — routes/uploader.ts 의 MIN_DOCS/MAX_DOCS 와 동기.
const MIN_DOCS = 2;
const MAX_DOCS = 5;

export function UploaderNewEventPage() {
  const { user, loading: authLoading, refresh } = useCurrentUser();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MyUploaderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterUploading, setPosterUploading] = useState(false);
  const [docs, setDocs] = useState<StagedDoc[]>([]);
  const [docsUploading, setDocsUploading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfileLoading(false);
      return;
    }
    const ctrl = new AbortController();
    Promise.all([fetchMyUploader(ctrl.signal), fetchRegions(ctrl.signal)])
      .then(([p, rs]) => {
        setProfile(p);
        setRegions(rs);
      })
      .catch((e) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown');
      })
      .finally(() => setProfileLoading(false));
    return () => ctrl.abort();
  }, [authLoading, user]);

  const sidoList = useMemo(
    () => Array.from(new Set(regions.map((r) => r.sido))).sort(),
    [regions],
  );
  const [selectedSido, setSelectedSido] = useState<string>('');
  const sigunguOptions = useMemo(
    () => regions.filter((r) => r.sido === selectedSido && r.sigungu !== null),
    [regions, selectedSido],
  );

  const canSubmit =
    form.title.trim().length >= 1 &&
    form.categoryCode.length > 0 &&
    form.regionId.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.endDate) &&
    form.startDate <= form.endDate &&
    docs.length >= MIN_DOCS &&
    docs.length <= MAX_DOCS;

  const toggleToUploader = async () => {
    setToggling(true);
    setError(null);
    try {
      await setActiveRole('uploader');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'toggle failed');
    } finally {
      setToggling(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    // 1) 포스터 파일 있으면 presigned PUT → publicUrl
    let posterUrl: string | null = null;
    if (posterFile) {
      setPosterUploading(true);
      try {
        posterUrl = await uploadPoster(posterFile);
      } catch (err) {
        setError(err instanceof Error ? `포스터 업로드 실패: ${err.message}` : '포스터 업로드 실패');
        setSubmitting(false);
        setPosterUploading(false);
        return;
      } finally {
        setPosterUploading(false);
      }
    }

    // 2) 서류 업로드 — 모든 파일 순차 presigned PUT. 하나라도 실패하면 중단.
    let uploadedDocs;
    setDocsUploading(true);
    try {
      uploadedDocs = await uploadDocuments(docs.map((d) => d.file));
    } catch (err) {
      setError(err instanceof Error ? `서류 업로드 실패: ${err.message}` : '서류 업로드 실패');
      setSubmitting(false);
      setDocsUploading(false);
      return;
    } finally {
      setDocsUploading(false);
    }

    try {
      const body: NewUploaderEventBody = {
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
        posterImageUrl: posterUrl,
        approvalDocuments: uploadedDocs,
      };
      await createUploaderEvent(body);
      navigate('/uploader');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'submit failed');
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
            Uploader · A_602
          </p>
          <h1 className="m-0 mt-1 text-[24px] font-bold tracking-[-0.015em]">새 이벤트 업로드</h1>
          <p className="m-0 mt-2 text-[13px] text-(--color-text-muted)">
            등록 후 관리자 승인을 거쳐 공개됩니다.
          </p>
        </header>

        {authLoading || profileLoading ? (
          <Box>불러오는 중…</Box>
        ) : !user ? (
          <Box>로그인이 필요해요.</Box>
        ) : !profile ? (
          <Box>
            먼저 <Link to="/uploader" className="underline">업로더 역할 신청</Link> 을 완료해 주세요.
          </Box>
        ) : profile.approvalStatus !== 'approved' ? (
          <Box>
            업로더 승인이 완료되지 않았어요. <Link to="/uploader" className="underline">업로더 콘솔</Link> 에서 상태를 확인해 주세요.
          </Box>
        ) : user.activeRole !== 'uploader' ? (
          <section className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6">
            <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">
              업로더 역할로 전환이 필요해요
            </h2>
            <p className="mt-1 text-[13px] text-(--color-text-muted)">
              실수 업로드를 막기 위해 일반 탐색 중에는 업로드 폼이 비활성화돼요. 전환 후 이어서 작성할 수 있어요.
            </p>
            {error && (
              <div className="mt-3 rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
                {error}
              </div>
            )}
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
            <Field label="제목" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                placeholder="예: 2026 한강 여름 페스티벌"
                className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="분류" required>
                <select
                  value={form.categoryCode}
                  onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value }))}
                  className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="지역" required>
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedSido}
                    onChange={(e) => {
                      setSelectedSido(e.target.value);
                      setForm((f) => ({ ...f, regionId: '' }));
                    }}
                    className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                  >
                    <option value="">시·도 선택</option>
                    {sidoList.map((sido) => (
                      <option key={sido} value={sido}>
                        {sido}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.regionId}
                    onChange={(e) => setForm((f) => ({ ...f, regionId: e.target.value }))}
                    disabled={selectedSido === ''}
                    className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">시·군·구 선택</option>
                    {sigunguOptions.map((r) => (
                      <option key={r.regionId} value={r.regionId}>
                        {r.sigungu}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="시작일" required>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                />
              </Field>
              <Field label="종료일" required>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                />
              </Field>
            </div>
            <Field label="상세 주소">
              <input
                type="text"
                value={form.addressDetail}
                onChange={(e) => setForm((f) => ({ ...f, addressDetail: e.target.value }))}
                maxLength={255}
                placeholder="예: 서울 영등포구 여의도동 한강공원"
                className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
              />
            </Field>
            <Field label="설명" hint="최대 10,000자. 사실 기반 담백하게">
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={10_000}
                rows={6}
                placeholder="이벤트 개요, 프로그램, 대상 등"
                className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] outline-none focus:border-(--color-accent)"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="운영 시간" hint="예: 매일 10:00~22:00">
                <input
                  type="text"
                  value={form.operatingHours}
                  onChange={(e) => setForm((f) => ({ ...f, operatingHours: e.target.value }))}
                  maxLength={100}
                  className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                />
              </Field>
              <Field label="대상 관객" hint="예: 가족, 20대">
                <input
                  type="text"
                  value={form.targetAudience}
                  onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
                  maxLength={100}
                  className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                />
              </Field>
              <Field label="입장료" hint="예: 무료, 1만원">
                <input
                  type="text"
                  value={form.admissionFee}
                  onChange={(e) => setForm((f) => ({ ...f, admissionFee: e.target.value }))}
                  maxLength={100}
                  className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="예상 인원구성 (주)" hint="가장 많을 것으로 예상되는 관객">
                <select
                  value={form.expectedCompanionPrimary}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      expectedCompanionPrimary:
                        e.target.value as FormState['expectedCompanionPrimary'],
                    }))
                  }
                  className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                >
                  <option value="">선택 안 함</option>
                  {COMPANION_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="예상 인원구성 (보조)">
                <select
                  value={form.expectedCompanionSecondary}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      expectedCompanionSecondary:
                        e.target.value as FormState['expectedCompanionSecondary'],
                    }))
                  }
                  className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
                >
                  <option value="">선택 안 함</option>
                  {COMPANION_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label={`서류 (${MIN_DOCS}~${MAX_DOCS}개 필수)`}
              hint="사업자등록증 · 상위기관 승인서 · 허가서 · 기타 신분 등. JPEG · PNG · PDF, 파일당 5MB"
            >
              <DocumentsPickerField
                files={docs}
                onChange={setDocs}
                uploading={docsUploading}
                allowedMime={APPROVAL_DOC_MIME}
                min={MIN_DOCS}
                max={MAX_DOCS}
              />
            </Field>

            <Field label="포스터 이미지" hint="JPEG · PNG · WebP, 최대 5MB">
              <PosterPickerField
                file={posterFile}
                onChange={setPosterFile}
                uploading={posterUploading}
              />
            </Field>

            {error && (
              <div className="rounded-(--radius-md) border border-(--color-error)/30 bg-(--color-error)/5 p-3 text-[13px] text-(--color-error)">
                업로드 실패: {error}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-(--color-border) pt-4">
              <p className="m-0 text-[12px] text-(--color-text-subtle)">
                등록 후 관리자 승인을 거쳐 공개됩니다.
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
                  {submitting ? '제출 중…' : '승인 대기로 제출'}
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

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-(--color-text)">
        {label}
        {required && <span className="ml-0.5 text-(--color-accent)">*</span>}
      </span>
      {children}
      {hint && <span className="text-[12px] text-(--color-text-subtle)">{hint}</span>}
    </label>
  );
}
