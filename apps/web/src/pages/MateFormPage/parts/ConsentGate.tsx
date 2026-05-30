import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('mate');
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <p className="mb-3 text-[13px] font-semibold text-(--color-text)">{t('consent.title')}</p>
      <p className="mb-3 text-[12px] text-(--color-text-muted) leading-relaxed">
        {t('consent.body')}
      </p>
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
        label={t('consent.label')}
      />
    </div>
  );
}
