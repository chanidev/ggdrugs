import { Checkbox } from 'seed-design/ui/checkbox';

interface ConsentGateProps {
  checked: boolean;
  onChange: (v: boolean) => void;
}

/**
 * ConsentGate — GG-MATCH-008/009/010 개인정보 약관 동의 체크박스.
 *
 * - 미동의 시 적용 버튼 disabled (부모가 checked 로 판단).
 * - SEED Checkbox 사용 (ui:checkbox 설치 필수 — Step 0 완료).
 * - SeedCheckbox.Root 의 onCheckedChange: (boolean | 'indeterminate') → void
 */
export function ConsentGate({ checked, onChange }: ConsentGateProps) {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <p className="mb-3 text-[13px] font-semibold text-(--color-text)">개인정보 처리 동의</p>
      <p className="mb-3 text-[12px] text-(--color-text-muted) leading-relaxed">
        메이트 매칭 서비스 이용을 위해 성별, 연령대, 지역, 국적 등의 개인정보를 수집·이용하는 것에
        동의합니다. 수집된 정보는 메이트 추천 목적으로만 활용되며, 서비스 종료 시 즉시 파기됩니다.
      </p>
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
        label="개인정보 수집·이용에 동의합니다 (필수)"
      />
    </div>
  );
}
