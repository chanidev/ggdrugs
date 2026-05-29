import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Header } from '../../layout/Header';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { Checkbox } from 'seed-design/ui/checkbox';
import * as Dialog from 'seed-design/ui/dialog';
import { ConsentGate } from './parts/ConsentGate.js';
import { SafetyNotice } from './parts/SafetyNotice.js';
import { saveMateProfile } from '../../lib/api/mate.js';
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

// ── 국적 목록 ──
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
  const navigate = useNavigate();
  const [regions, setRegions] = useState<RegionItem[]>([]);
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

  const reset = useCallback(() => {
    setForm(INIT);
    setErr(null);
  }, []);

  const validate = (): string | null => {
    if (!form.gender) return '성별을 선택해 주세요.';
    if (form.ageRangeLower === null) return '연령대를 선택해 주세요.';
    if (form.hasCar === null) return '자차 보유 여부를 선택해 주세요.';
    if (!form.nationality) return '국적을 선택해 주세요.';
    if (form.koreanOk === null) return '한국어 소통 가능 여부를 선택해 주세요.';
    if (!form.consented) return '개인정보 수집·이용에 동의해 주세요.';
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
      if (m === 'UNAUTHENTICATED') setErr('로그인이 필요해요.');
      else if (m === 'CONSENT_REQUIRED') setErr('개인정보 수집·이용에 동의해 주세요.');
      else if (m.startsWith('VALIDATION:')) setErr('입력 값을 확인해 주세요.');
      else setErr('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
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
            <h1 className="text-(length:--text-h2) font-semibold">메이트 추천 받기</h1>
            <p className="mt-1 text-[13px] text-(--color-text-muted)">
              나의 정보와 선호 조건을 입력하면 어울리는 메이트를 추천해 드려요.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {/* ── 내 정보 섹션 ── */}
            <section aria-labelledby="my-info-title">
              <h2
                id="my-info-title"
                className="mb-4 text-[15px] font-semibold text-(--color-text)"
              >
                내 정보
              </h2>
              <div className="flex flex-col gap-5">
                {/* 성별 */}
                <FieldRow label="성별" required>
                  <SegmentedControl
                    aria-label="성별 선택"
                    value={form.gender}
                    onValueChange={(v) => upd('gender', v as 'M' | 'F')}
                  >
                    <SegmentedControlItem value="M">남성</SegmentedControlItem>
                    <SegmentedControlItem value="F">여성</SegmentedControlItem>
                  </SegmentedControl>
                </FieldRow>

                {/* 연령대 */}
                <FieldRow label="연령대" required>
                  <SegmentedControl
                    aria-label="연령대 선택"
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
                <FieldRow label="지역 (시/도)">
                  <select
                    aria-label="본인 지역 선택"
                    value={form.regionId ?? ''}
                    onChange={(e) => upd('regionId', e.target.value || null)}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none"
                  >
                    <option value="">선택 안 함 (상관없음)</option>
                    {sidoRegions.map((r) => (
                      <option key={r.regionId} value={r.regionId}>
                        {r.sido}
                      </option>
                    ))}
                  </select>
                </FieldRow>

                {/* 자차 */}
                <FieldRow label="자차 보유" required>
                  <SegmentedControl
                    aria-label="자차 보유 여부"
                    value={form.hasCar === null ? '' : String(form.hasCar)}
                    onValueChange={(v) => upd('hasCar', v === 'true')}
                  >
                    <SegmentedControlItem value="true">있음</SegmentedControlItem>
                    <SegmentedControlItem value="false">없음</SegmentedControlItem>
                  </SegmentedControl>
                </FieldRow>

                {/* 국적 */}
                <FieldRow label="국적" required>
                  <select
                    aria-label="국적 선택"
                    value={form.nationality}
                    onChange={(e) => upd('nationality', e.target.value)}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none"
                  >
                    <option value="">선택해 주세요</option>
                    {NATIONALITIES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </FieldRow>

                {/* 한국어 소통 */}
                <FieldRow label="한국어 소통" required>
                  <SegmentedControl
                    aria-label="한국어 소통 가능 여부"
                    value={form.koreanOk === null ? '' : String(form.koreanOk)}
                    onValueChange={(v) => upd('koreanOk', v === 'true')}
                  >
                    <SegmentedControlItem value="true">가능</SegmentedControlItem>
                    <SegmentedControlItem value="false">불가</SegmentedControlItem>
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
                선호 조건
              </h2>
              <p className="mb-4 text-[12px] text-(--color-text-muted)">
                "상관없음" 체크 시 해당 조건을 무시하고 매칭합니다.
              </p>
              <div className="flex flex-col gap-5">
                {/* 선호 성별 */}
                <PrefRow
                  label="선호 성별"
                  dontCare={form.prefGenderDontCare}
                  onDontCareChange={(v) => upd('prefGenderDontCare', v)}
                >
                  <SegmentedControl
                    aria-label="선호 성별 선택"
                    value={form.prefGender}
                    onValueChange={(v) => upd('prefGender', v as 'M' | 'F')}
                  >
                    <SegmentedControlItem value="M">남성</SegmentedControlItem>
                    <SegmentedControlItem value="F">여성</SegmentedControlItem>
                  </SegmentedControl>
                </PrefRow>

                {/* 선호 연령대 */}
                <PrefRow
                  label="선호 연령대"
                  dontCare={form.prefAgeDontCare}
                  onDontCareChange={(v) => upd('prefAgeDontCare', v)}
                >
                  <SegmentedControl
                    aria-label="선호 연령대 선택"
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
                  label="선호 지역"
                  dontCare={form.prefRegionDontCare}
                  onDontCareChange={(v) => upd('prefRegionDontCare', v)}
                >
                  <select
                    aria-label="선호 지역 선택"
                    value={form.prefRegionId ?? ''}
                    onChange={(e) => upd('prefRegionId', e.target.value || null)}
                    disabled={form.prefRegionDontCare}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none disabled:opacity-40"
                  >
                    <option value="">선택해 주세요</option>
                    {sidoRegions.map((r) => (
                      <option key={r.regionId} value={r.regionId}>
                        {r.sido}
                      </option>
                    ))}
                  </select>
                </PrefRow>

                {/* 선호 자차 */}
                <PrefRow
                  label="자차 보유 선호"
                  dontCare={form.prefHasCarDontCare}
                  onDontCareChange={(v) => upd('prefHasCarDontCare', v)}
                >
                  <SegmentedControl
                    aria-label="자차 보유 선호 여부"
                    value={form.prefHasCar === null ? '' : String(form.prefHasCar)}
                    onValueChange={(v) => upd('prefHasCar', v === 'true')}
                  >
                    <SegmentedControlItem value="true">있으면 좋음</SegmentedControlItem>
                    <SegmentedControlItem value="false">없어도 됨</SegmentedControlItem>
                  </SegmentedControl>
                </PrefRow>

                {/* 선호 국적 */}
                <PrefRow
                  label="선호 국적"
                  dontCare={form.prefNationalityDontCare}
                  onDontCareChange={(v) => upd('prefNationalityDontCare', v)}
                >
                  <select
                    aria-label="선호 국적 선택"
                    value={form.prefNationality}
                    onChange={(e) => upd('prefNationality', e.target.value)}
                    disabled={form.prefNationalityDontCare}
                    className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px] text-(--color-text) focus:border-(--color-accent) focus:outline-none disabled:opacity-40"
                  >
                    <option value="">선택해 주세요</option>
                    {NATIONALITIES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </PrefRow>

                {/* 선호 한국어 소통 */}
                <PrefRow
                  label="한국어 소통 선호"
                  dontCare={form.prefKoreanOkDontCare}
                  onDontCareChange={(v) => upd('prefKoreanOkDontCare', v)}
                >
                  <SegmentedControl
                    aria-label="한국어 소통 선호 여부"
                    value={form.prefKoreanOk === null ? '' : String(form.prefKoreanOk)}
                    onValueChange={(v) => upd('prefKoreanOk', v === 'true')}
                  >
                    <SegmentedControlItem value="true">가능해야 함</SegmentedControlItem>
                    <SegmentedControlItem value="false">불가도 됨</SegmentedControlItem>
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
                매칭 옵션
              </h2>
              <div className="flex flex-col gap-3">
                <Checkbox
                  checked={form.autoRecommend}
                  onCheckedChange={(v) => upd('autoRecommend', v)}
                  label="자동 추천 활성화 (추천 목록에 내 프로필이 노출됩니다)"
                />
                <Checkbox
                  checked={form.groupApply}
                  onCheckedChange={(v) => upd('groupApply', v)}
                  label="그룹 신청 허용 (2~4인 메이트 그룹도 추천받기)"
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
                다시 입력
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
                적용하기
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
              <Dialog.Title>메이트 매칭 등록 완료</Dialog.Title>
            </Dialog.Header>
            <div className="px-5 pb-2 text-[14px] text-(--color-text-muted)">
              <p>
                정보가 저장됐어요. 이제 커뮤니티에서 추천 메이트를 확인해 보세요!
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
                커뮤니티 보기
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
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-(--color-text)">
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
  onDontCareChange,
  children,
}: {
  label: string;
  dontCare: boolean;
  onDontCareChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-(--color-text)">{label}</span>
        <Checkbox
          checked={dontCare}
          onCheckedChange={onDontCareChange}
          label="상관없음"
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
