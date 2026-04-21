import type { RegionItem } from '../../lib/api';

/**
 * UploaderNewEventPage 와 UploaderEventEditPage 에서 공유하는 폼 필드.
 * 포스터/서류 피커는 상위 페이지가 관리 (생성 vs 수정 간 UX 상이).
 */

export type CompanionCode = 'family' | 'friend' | 'couple' | 'solo';

export type EventFormState = {
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
  expectedCompanionPrimary: '' | CompanionCode;
  expectedCompanionSecondary: '' | CompanionCode;
};

export const EVENT_FORM_INITIAL: EventFormState = {
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

export const EVENT_CATEGORY_OPTIONS: { code: string; label: string }[] = [
  { code: 'festival', label: '축제' },
  { code: 'expo', label: '박람회' },
  { code: 'symposium', label: '심포지움' },
  { code: 'conference', label: '컨퍼런스' },
  { code: 'exhibition', label: '전시' },
  { code: 'performance', label: '공연' },
  { code: 'education', label: '교육' },
  { code: 'movie', label: '영화' },
];

export const EVENT_COMPANION_OPTIONS: { code: CompanionCode; label: string }[] = [
  { code: 'family', label: '가족' },
  { code: 'friend', label: '친구' },
  { code: 'couple', label: '연인' },
  { code: 'solo', label: '혼자' },
];

export function isEventFormFilled(f: EventFormState): boolean {
  return (
    f.title.trim().length >= 1 &&
    f.categoryCode.length > 0 &&
    f.regionId.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.endDate) &&
    f.startDate <= f.endDate
  );
}

export function EventFormFields({
  form,
  setForm,
  regions,
}: {
  form: EventFormState;
  setForm: (updater: (f: EventFormState) => EventFormState) => void;
  regions: RegionItem[];
}) {
  const seoulRegions = regions.filter((r) => r.sido === '서울' && r.sigungu !== null);

  return (
    <>
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
            {EVENT_CATEGORY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="지역 (서울 구)" required>
          <select
            value={form.regionId}
            onChange={(e) => setForm((f) => ({ ...f, regionId: e.target.value }))}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
          >
            <option value="">선택</option>
            {seoulRegions.map((r) => (
              <option key={r.regionId} value={r.regionId}>
                {r.sigungu}
              </option>
            ))}
          </select>
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
                expectedCompanionPrimary: e.target.value as EventFormState['expectedCompanionPrimary'],
              }))
            }
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
          >
            <option value="">선택 안 함</option>
            {EVENT_COMPANION_OPTIONS.map((c) => (
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
                  e.target.value as EventFormState['expectedCompanionSecondary'],
              }))
            }
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
          >
            <option value="">선택 안 함</option>
            {EVENT_COMPANION_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}

export function Field({
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
