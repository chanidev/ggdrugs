import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../layout/Header';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { Checkbox } from 'seed-design/ui/checkbox';
import * as Dialog from 'seed-design/ui/dialog';
import { ConsentGate } from './parts/ConsentGate.js';
import { SafetyNotice } from './parts/SafetyNotice.js';
import { saveMateProfile, fetchUpcomingMateEvents, type MateEvent } from '../../lib/api/mate.js';
import { fetchRegions, type RegionItem } from '../../lib/api/events.js';

/**
 * MateFormPage — A_801 메이트 추천 받기 폼 (GG-MATCH-001~017).
 *
 * GG-MATCH-004/005: 지역 시/도 select (본인 + 선호)
 * GG-MATCH-008: 개인정보 약관 + 안전 가이드라인
 * GG-MATCH-009/010: 약관 미동의 시 저장 422 + 적용 버튼 disabled
 * GG-MATCH-013: 성공 dialog
 * GG-MATCH-014: 성공 후 /community 이동
 * GG-MATCH-017: 다시하기 = 초기화
 */

// ── 연령대 라벨 (5세 단위 하한, "하한~하한+4" 형식) ──
const AGE_RANGES = [10, 15, 20, 25, 30, 35, 40, 45, 50] as const;
type AgeRange = (typeof AGE_RANGES)[number];
function ageLabel(lower: AgeRange): string {
  return `${lower}~${lower + 4}`;
}

// ── 국적 목록 (백엔드 value 는 한국어 고정, 라벨만 번역) ──
const NATIONALITIES = [
  '한국',
  '미국',
  '일본',
  '중국',
  '영국',
  '프랑스',
  '독일',
  '캐나다',
  '호주',
  '기타',
] as const;

interface FormState {
  selectedEventId: string | null; // GG-MATCH-003: 함께 갈 축제 (2주내)
  gender: 'M' | 'F' | '';
  ageRangeLower: AgeRange | null;
  regionId: string | null;
  hasCar: boolean | null;
  nationality: string;
  koreanOk: boolean | null;
  // 선호 (null = 상관없음)
  prefGenderDontCare: boolean;
  prefGender: 'M' | 'F' | '';
  prefAgeDontCare: boolean;
  prefAgeLower: AgeRange | null;
  prefRegionDontCare: boolean;
  prefRegionId: string | null;
  prefHasCarDontCare: boolean;
  prefHasCar: boolean | null;
  prefNationalityDontCare: boolean;
  prefNationality: string;
  prefKoreanOkDontCare: boolean;
  prefKoreanOk: boolean | null;
  // 플래그
  autoRecommend: boolean;
  groupApply: boolean;
  // 약관
  consented: boolean;
}

const INIT: FormState = {
  selectedEventId: null,
  gender: '',
  ageRangeLower: null,
  regionId: null,
  hasCar: null,
  nationality: '',
  koreanOk: null,
  prefGenderDontCare: true,
  prefGender: '',
  prefAgeDontCare: true,
  prefAgeLower: null,
  prefRegionDontCare: true,
  prefRegionId: null,
  prefHasCarDontCare: true,
  prefHasCar: null,
  prefNationalityDontCare: true,
  prefNationality: '',
  prefKoreanOkDontCare: true,
  prefKoreanOk: null,
  autoRecommend: true,
  groupApply: false,
  consented: false,
};

export function MateFormPage() {
  const { t } = useTranslation('mate');
  const navigate = useNavigate();
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [events, setEvents] = useState<MateEvent[]>([]);
  const [eventsLoadFailed, setEventsLoadFailed] = useState(false);
  const [form, setForm] = useState<FormState>(INIT);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  // 시/도 단위만 (sigungu==null) 추출 — 드롭다운 간소화
  const sidoRegions = regions.filter((r) => r.sigungu === null);

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // 지역 로드
  useEffect(() => {
    const ctrl = new AbortController();
    fetchRegions(ctrl.signal)
      .then(setRegions)
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') {
          // 지역 로드 실패는 UI 비차단 — select 비어 있음으로 graceful degrade.
          console.warn('[MateFormPage] 지역 목록 로드 실패', e);
        }
      });
    return () => ctrl.abort();
  }, []);

  // 2주내 개최 예정 축제 로드 (GG-MATCH-003 "축제 선택")
  useEffect(() => {
    let mounted = true;
    fetchUpcomingMateEvents()
      .then((list) => { if (mounted) { setEvents(list); setEventsLoadFailed(false); } })
      .catch((e: unknown) => {
        // 로드 실패는 UI 비차단(저장 허용)이나, "윈도우에 축제 없음"과 구분해 사용자에게 알린다.
        // (실패를 침묵하면 검증이 축제 필수를 건너뛰어 no_event 로 빠지는 원인 — 리뷰 지적)
        if (mounted) setEventsLoadFailed(true);
        console.warn('[MateFormPage] 축제 목록 로드 실패', e);
      });
    return () => { mounted = false; };
  }, []);

  const reset = useCallback(() => {
    setForm(INIT);
    setErr(null);
  }, []);

  const validate = (): string | null => {
    // GG-MATCH-003: 선택 가능한 축제가 있으면 반드시 선택 (없으면 graceful 통과).
    if (events.length > 0 && !form.selectedEventId) return t('form.selectEvent');
    if (!form.gender) return t('form.selectGender');
    if (form.ageRangeLower === null) return t('form.selectAgeRange');
    if (form.hasCar === null) return t('form.selectHasCar');
    if (!form.nationality) return t('form.selectNationality');
    if (form.koreanOk === null) return t('form.selectKoreanOk');
    if (!form.consented) return t('form.consentRequired');
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setPending(true);
    setErr(null);
    try {
      await saveMateProfile({
        selectedEventId: form.selectedEventId,
        gender: form.gender as 'M' | 'F',
        ageRangeLower: form.ageRangeLower!,
        regionId: form.regionId,
        hasCar: form.hasCar!,
        nationality: form.nationality,
        koreanOk: form.koreanOk!,
        prefGender: form.prefGenderDontCare ? null : (form.prefGender || null),
        prefAgeLower: form.prefAgeDontCare ? null : form.prefAgeLower,
        prefRegionId: form.prefRegionDontCare ? null : form.prefRegionId,
        prefHasCar: form.prefHasCarDontCare ? null : form.prefHasCar,
        prefNationality: form.prefNationalityDontCare ? null : (form.prefNationality || null),
        prefKoreanOk: form.prefKoreanOkDontCare ? null : form.prefKoreanOk,
        autoRecommend: form.autoRecommend,
        groupApply: form.groupApply,
        consentedAt: new Date().toISOString(),
      });
      setSuccessOpen(true);
    } catch (e) {
      const m = (e as Error).message;
      if (m === 'UNAUTHENTICATED') setErr(t('form.loginRequired'));
      else if (m === 'CONSENT_REQUIRED') setErr(t('form.consentRequired'));
      else if (m === 'EVENT_NOT_SELECTABLE') setErr(t('form.eventNotSelectable'));
      else if (m.startsWith('VALIDATION:')) setErr(t('form.validationError'));
      else setErr(t('form.saveError'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-4 py-8">
          {/* 페이지 타이틀 */}
          <div className="mb-6">
            <h1 className="text-(length:--text-h2) font-semibold">{t('form.title')}</h1>
            <p className="mt-1 text-[13px] text-(--color-text-muted)">
              {t('form.subtitle')}
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {/* ── 축제 선택 섹션 (GG-MATCH-003) ── */}
            <section aria-labelledby="event-select-title">
              <h2
                id="event-select-title"
                className="mb-1 text-[15px] font-semibold text-(--color-text)"
              >
                {t('form.eventSection')}
                <span className="ml-0.5 text-(--color-error)" aria-hidden>*</span>
              </h2>
              <p className="mb-4 text-[12px] text-(--color-text-muted)">{t('form.eventNote')}</p>
              <FieldRow label={t('form.event')} htmlFor="field-selected-event-id">
                <select
                  id="field-selected-event-id"
                  aria-label={t('form.eventAriaLabel')}
                  value={form.selectedEventId ?? ''}
                  onChange={(e) => upd('selectedEventId', e.target.value || null)}
                  disabled={events.length === 0}
                  className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none disabled:opacity-40"
                >
                  <option value="">
                    {events.length === 0 ? t('form.eventEmpty') : t('form.eventPlaceholder')}
                  </option>
                  {events.map((ev) => (
                    <option key={ev.eventId} value={ev.eventId}>
                      {ev.startDate} · {ev.title}
                      {ev.regionName ? ` (${ev.regionName})` : ''}
                    </option>
                  ))}
                </select>
              </FieldRow>
              {eventsLoadFailed && (
                <p role="alert" className="mt-1.5 text-[12px] text-(--color-error)">
                  {t('form.eventLoadFailed')}
                </p>
              )}
            </section>

            {/* ── 내 정보 섹션 ── */}
            <section aria-labelledby="my-info-title">
              <h2
                id="my-info-title"
                className="mb-4 text-[15px] font-semibold text-(--color-text)"
              >
                {t('form.myInfo')}
              </h2>
              <div className="flex flex-col gap-5">
                {/* 성별 */}
                <FieldRow label={t('form.gender')} required>
                  <SegmentedControl
                    aria-label={t('form.genderAriaLabel')}
                    value={form.gender}
                    onValueChange={(v) => upd('gender', v as 'M' | 'F')}
                  >
                    <SegmentedControlItem value="M">{t('form.male')}</SegmentedControlItem>
                    <SegmentedControlItem value="F">{t('form.female')}</SegmentedControlItem>
                  </SegmentedControl>
                </FieldRow>

                {/* 연령대 */}
                <FieldRow label={t('form.ageRange')} required>
                  <SegmentedControl
                    aria-label={t('form.ageRangeAriaLabel')}
                    value={form.ageRangeLower !== null ? String(form.ageRangeLower) : ''}
                    onValueChange={(v) => upd('ageRangeLower', Number(v) as AgeRange)}
                  >
                    {AGE_RANGES.map((a) => (
                      <SegmentedControlItem key={a} value={String(a)}>
                        {ageLabel(a)}
                      </SegmentedControlItem>
                    ))}
                  </SegmentedControl>
                </FieldRow>

                {/* 지역 (시/도) — GG-MATCH-004 */}
                <FieldRow label={t('form.region')} htmlFor="field-region-id">
                  <select
                    id="field-region-id"
                    aria-label={t('form.regionAriaLabel')}
                    value={form.regionId ?? ''}
                    onChange={(e) => upd('regionId', e.target.value || null)}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none"
                  >
                    <option value="">{t('form.regionNone')}</option>
                    {sidoRegions.map((r) => (
                      <option key={r.regionId} value={r.regionId}>
                        {r.sido}
                      </option>
                    ))}
                  </select>
                </FieldRow>

                {/* 자차 */}
                <FieldRow label={t('form.hasCar')} required>
                  <SegmentedControl
                    aria-label={t('form.hasCarAriaLabel')}
                    value={form.hasCar === null ? '' : String(form.hasCar)}
                    onValueChange={(v) => upd('hasCar', v === 'true')}
                  >
                    <SegmentedControlItem value="true">{t('form.hasCarYes')}</SegmentedControlItem>
                    <SegmentedControlItem value="false">{t('form.hasCarNo')}</SegmentedControlItem>
                  </SegmentedControl>
                </FieldRow>

                {/* 국적 */}
                <FieldRow label={t('form.nationality')} required htmlFor="field-nationality-id">
                  <select
                    id="field-nationality-id"
                    aria-label={t('form.nationalityAriaLabel')}
                    value={form.nationality}
                    onChange={(e) => upd('nationality', e.target.value)}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none"
                  >
                    <option value="">{t('form.nationalityPlaceholder')}</option>
                    {NATIONALITIES.map((n) => (
                      <option key={n} value={n}>
                        {t(`nationalities.${n}`)}
                      </option>
                    ))}
                  </select>
                </FieldRow>

                {/* 한국어 소통 */}
                <FieldRow label={t('form.koreanOk')} required>
                  <SegmentedControl
                    aria-label={t('form.koreanOkAriaLabel')}
                    value={form.koreanOk === null ? '' : String(form.koreanOk)}
                    onValueChange={(v) => upd('koreanOk', v === 'true')}
                  >
                    <SegmentedControlItem value="true">{t('form.koreanOkYes')}</SegmentedControlItem>
                    <SegmentedControlItem value="false">{t('form.koreanOkNo')}</SegmentedControlItem>
                  </SegmentedControl>
                </FieldRow>
              </div>
            </section>

            {/* ── 선호 조건 섹션 ── */}
            <section aria-labelledby="pref-title">
              <h2
                id="pref-title"
                className="mb-1 text-[15px] font-semibold text-(--color-text)"
              >
                {t('form.prefConditions')}
              </h2>
              <p className="mb-4 text-[12px] text-(--color-text-muted)">
                {t('form.prefNote')}
              </p>
              <div className="flex flex-col gap-5">
                {/* 선호 성별 */}
                <PrefRow
                  label={t('form.prefGender')}
                  dontCare={form.prefGenderDontCare}
                  dontCareLabel={t('form.dontCare')}
                  onDontCareChange={(v) => upd('prefGenderDontCare', v)}
                >
                  <SegmentedControl
                    aria-label={t('form.prefGenderAriaLabel')}
                    value={form.prefGender}
                    onValueChange={(v) => upd('prefGender', v as 'M' | 'F')}
                  >
                    <SegmentedControlItem value="M">{t('form.male')}</SegmentedControlItem>
                    <SegmentedControlItem value="F">{t('form.female')}</SegmentedControlItem>
                  </SegmentedControl>
                </PrefRow>

                {/* 선호 연령대 */}
                <PrefRow
                  label={t('form.prefAgeRange')}
                  dontCare={form.prefAgeDontCare}
                  dontCareLabel={t('form.dontCare')}
                  onDontCareChange={(v) => upd('prefAgeDontCare', v)}
                >
                  <SegmentedControl
                    aria-label={t('form.prefAgeRangeAriaLabel')}
                    value={form.prefAgeLower !== null ? String(form.prefAgeLower) : ''}
                    onValueChange={(v) => upd('prefAgeLower', Number(v) as AgeRange)}
                  >
                    {AGE_RANGES.map((a) => (
                      <SegmentedControlItem key={a} value={String(a)}>
                        {ageLabel(a)}
                      </SegmentedControlItem>
                    ))}
                  </SegmentedControl>
                </PrefRow>

                {/* 선호 지역 (시/도) — GG-MATCH-005 */}
                <PrefRow
                  label={t('form.prefRegion')}
                  dontCare={form.prefRegionDontCare}
                  dontCareLabel={t('form.dontCare')}
                  onDontCareChange={(v) => upd('prefRegionDontCare', v)}
                  htmlFor="field-pref-region-id"
                >
                  <select
                    id="field-pref-region-id"
                    aria-label={t('form.prefRegionAriaLabel')}
                    value={form.prefRegionId ?? ''}
                    onChange={(e) => upd('prefRegionId', e.target.value || null)}
                    disabled={form.prefRegionDontCare}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none disabled:opacity-40"
                  >
                    <option value="">{t('form.regionNone')}</option>
                    {sidoRegions.map((r) => (
                      <option key={r.regionId} value={r.regionId}>
                        {r.sido}
                      </option>
                    ))}
                  </select>
                </PrefRow>

                {/* 선호 자차 */}
                <PrefRow
                  label={t('form.prefHasCar')}
                  dontCare={form.prefHasCarDontCare}
                  dontCareLabel={t('form.dontCare')}
                  onDontCareChange={(v) => upd('prefHasCarDontCare', v)}
                >
                  <SegmentedControl
                    aria-label={t('form.prefHasCarAriaLabel')}
                    value={form.prefHasCar === null ? '' : String(form.prefHasCar)}
                    onValueChange={(v) => upd('prefHasCar', v === 'true')}
                  >
                    <SegmentedControlItem value="true">{t('form.prefHasCarYes')}</SegmentedControlItem>
                    <SegmentedControlItem value="false">{t('form.prefHasCarNo')}</SegmentedControlItem>
                  </SegmentedControl>
                </PrefRow>

                {/* 선호 국적 */}
                <PrefRow
                  label={t('form.prefNationality')}
                  dontCare={form.prefNationalityDontCare}
                  dontCareLabel={t('form.dontCare')}
                  onDontCareChange={(v) => upd('prefNationalityDontCare', v)}
                  htmlFor="field-pref-nationality-id"
                >
                  <select
                    id="field-pref-nationality-id"
                    aria-label={t('form.prefNationalityAriaLabel')}
                    value={form.prefNationality}
                    onChange={(e) => upd('prefNationality', e.target.value)}
                    disabled={form.prefNationalityDontCare}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none disabled:opacity-40"
                  >
                    <option value="">{t('form.nationalityPlaceholder')}</option>
                    {NATIONALITIES.map((n) => (
                      <option key={n} value={n}>
                        {t(`nationalities.${n}`)}
                      </option>
                    ))}
                  </select>
                </PrefRow>

                {/* 선호 한국어 소통 */}
                <PrefRow
                  label={t('form.prefKoreanOk')}
                  dontCare={form.prefKoreanOkDontCare}
                  dontCareLabel={t('form.dontCare')}
                  onDontCareChange={(v) => upd('prefKoreanOkDontCare', v)}
                >
                  <SegmentedControl
                    aria-label={t('form.prefKoreanOkAriaLabel')}
                    value={form.prefKoreanOk === null ? '' : String(form.prefKoreanOk)}
                    onValueChange={(v) => upd('prefKoreanOk', v === 'true')}
                  >
                    <SegmentedControlItem value="true">{t('form.prefKoreanOkYes')}</SegmentedControlItem>
                    <SegmentedControlItem value="false">{t('form.prefKoreanOkNo')}</SegmentedControlItem>
                  </SegmentedControl>
                </PrefRow>
              </div>
            </section>

            {/* ── 매칭 옵션 ── */}
            <section aria-labelledby="match-options-title">
              <h2
                id="match-options-title"
                className="mb-4 text-[15px] font-semibold text-(--color-text)"
              >
                {t('form.matchOptions')}
              </h2>
              <div className="flex flex-col gap-3">
                <Checkbox
                  checked={form.autoRecommend}
                  onCheckedChange={(v) => upd('autoRecommend', v)}
                  label={t('form.autoRecommend')}
                />
                <Checkbox
                  checked={form.groupApply}
                  onCheckedChange={(v) => upd('groupApply', v)}
                  label={t('form.groupApply')}
                />
              </div>
            </section>

            {/* ── 안전 가이드라인 ── */}
            <SafetyNotice />

            {/* ── 개인정보 약관 (ConsentGate) — GG-MATCH-008/009/010 ── */}
            <ConsentGate
              checked={form.consented}
              onChange={(v) => upd('consented', v)}
            />

            {/* ── 에러 메시지 ── */}
            {err && (
              <p role="alert" className="text-[13px] text-(--color-error)">
                {err}
              </p>
            )}

            {/* ── 버튼 영역 ── */}
            <div className="flex gap-3">
              {/* 다시하기 — GG-MATCH-017 */}
              <ActionButton
                variant="neutralOutline"
                size="medium"
                onClick={reset}
                disabled={pending}
                className="flex-1"
              >
                {t('form.reset')}
              </ActionButton>
              {/* 적용 — 미동의 시 disabled (GG-MATCH-010) */}
              <ActionButton
                variant="brandSolid"
                size="medium"
                onClick={() => { void submit(); }}
                loading={pending}
                disabled={pending || !form.consented}
                className="flex-1"
              >
                {t('form.submit')}
              </ActionButton>
            </div>
          </div>
        </div>
      </div>

      {/* ── 성공 Dialog (GG-MATCH-013/014) ── */}
      <Dialog.Root
        open={successOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSuccessOpen(false);
            void navigate('/community');
          }
        }}
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content className="w-[360px] max-w-[92vw]">
            <Dialog.Header>
              <Dialog.Title>{t('form.successTitle')}</Dialog.Title>
            </Dialog.Header>
            <div className="px-5 pb-2 text-[14px] text-(--color-text-muted)">
              <p>
                {t('form.successBody')}
              </p>
            </div>
            <Dialog.Footer>
              <ActionButton
                variant="brandSolid"
                size="medium"
                onClick={() => {
                  setSuccessOpen(false);
                  void navigate('/community');
                }}
              >
                {t('form.goToCommunity')}
              </ActionButton>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </div>
  );
}

// ── 내부 헬퍼 컴포넌트 ──

function FieldRow({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  /** Pass the id of the associated control (e.g. a native <select>) so the <label> is
   *  programmatically linked. SegmentedControl controls already carry their own aria-label
   *  and do not need this. */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-(--color-text)">
        {label}
        {required && <span className="ml-0.5 text-(--color-error)" aria-hidden>*</span>}
      </label>
      {children}
    </div>
  );
}

function PrefRow({
  label,
  dontCare,
  dontCareLabel,
  onDontCareChange,
  htmlFor,
  children,
}: {
  label: string;
  dontCare: boolean;
  dontCareLabel: string;
  onDontCareChange: (v: boolean) => void;
  /** Pass the id of an associated native control (e.g. <select>) to link the visible label
   *  text via htmlFor. Not needed for SegmentedControl, which carries its own aria-label. */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        {htmlFor ? (
          <label
            htmlFor={htmlFor}
            className="text-[13px] font-medium text-(--color-text)"
          >
            {label}
          </label>
        ) : (
          <span className="text-[13px] font-medium text-(--color-text)">{label}</span>
        )}
        <Checkbox
          checked={dontCare}
          onCheckedChange={onDontCareChange}
          label={dontCareLabel}
        />
      </div>
      <div
        className={dontCare ? 'pointer-events-none opacity-40' : undefined}
        {...(dontCare ? { inert: true } : {})}
      >
        {children}
      </div>
    </div>
  );
}
