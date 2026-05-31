import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

export const EVENT_CATEGORY_CODES = [
  'festival',
  'expo',
  'symposium',
  'conference',
  'exhibition',
  'performance',
  'education',
  'movie',
] as const;

export const EVENT_COMPANION_CODES: CompanionCode[] = ['family', 'friend', 'couple', 'solo'];

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
  const { t } = useTranslation('uploader');
  const sidoList = useMemo(
    () => Array.from(new Set(regions.map((r) => r.sido))).sort(),
    [regions],
  );
  const [selectedSido, setSelectedSido] = useState<string>(
    () => regions.find((r) => r.regionId === form.regionId)?.sido ?? '',
  );
  const sigunguOptions = useMemo(
    () => regions.filter((r) => r.sido === selectedSido && r.sigungu !== null),
    [regions, selectedSido],
  );

  return (
    <>
      <Field label={t('form.title')} required>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          maxLength={200}
          placeholder={t('form.titleNewPlaceholder')}
          className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px] outline-none focus:border-(--color-accent) focus:shadow-[0_0_0_4px_var(--color-accent-bg)]"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('form.category')} required>
          <select
            value={form.categoryCode}
            onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value }))}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
          >
            {EVENT_CATEGORY_CODES.map((code) => (
              <option key={code} value={code}>
                {t(`category.${code}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('form.region')} required>
          <div className="flex flex-col gap-2">
            <select
              value={selectedSido}
              onChange={(e) => {
                setSelectedSido(e.target.value);
                setForm((f) => ({ ...f, regionId: '' }));
              }}
              className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
            >
              <option value="">{t('form.sidoPlaceholder')}</option>
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
              <option value="">{t('form.sigunguPlaceholder')}</option>
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
        <Field label={t('form.startDate')} required>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
          />
        </Field>
        <Field label={t('form.endDate')} required>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
          />
        </Field>
      </div>
      <Field label={t('form.addressDetail')}>
        <input
          type="text"
          value={form.addressDetail}
          onChange={(e) => setForm((f) => ({ ...f, addressDetail: e.target.value }))}
          maxLength={255}
          placeholder={t('form.addressDetailPlaceholder')}
          className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
        />
      </Field>
      <Field label={t('form.description')} hint={t('form.descriptionHint')}>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          maxLength={10_000}
          rows={6}
          placeholder={t('form.descriptionPlaceholder')}
          className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] outline-none focus:border-(--color-accent)"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label={t('form.operatingHours')} hint={t('form.operatingHoursHint')}>
          <input
            type="text"
            value={form.operatingHours}
            onChange={(e) => setForm((f) => ({ ...f, operatingHours: e.target.value }))}
            maxLength={100}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
          />
        </Field>
        <Field label={t('form.targetAudience')} hint={t('form.targetAudienceHint')}>
          <input
            type="text"
            value={form.targetAudience}
            onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
            maxLength={100}
            className="h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[14px]"
          />
        </Field>
        <Field label={t('form.admissionFee')} hint={t('form.admissionFeeHint')}>
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
        <Field label={t('form.companionPrimary')} hint={t('form.companionPrimaryHint')}>
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
            <option value="">{t('form.companionNone')}</option>
            {EVENT_COMPANION_CODES.map((code) => (
              <option key={code} value={code}>
                {t(`companion.${code}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('form.companionSecondary')}>
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
            <option value="">{t('form.companionNone')}</option>
            {EVENT_COMPANION_CODES.map((code) => (
              <option key={code} value={code}>
                {t(`companion.${code}`)}
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
