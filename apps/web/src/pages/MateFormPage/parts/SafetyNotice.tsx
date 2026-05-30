import { useTranslation } from 'react-i18next';

/**
 * SafetyNotice — GG-MATCH-008 안전 가이드라인 블록.
 *
 * 메이트 추천 받기 폼 하단에 노출.
 * PII 제공 전 사용자에게 안전 수칙을 명시적으로 안내한다.
 */
export function SafetyNotice() {
  const { t } = useTranslation('mate');
  return (
    <div
      role="note"
      aria-label={t('safetyNotice.ariaLabel')}
      className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-alt) p-4 text-[13px] text-(--color-text-muted)"
    >
      <p className="mb-2 font-semibold text-(--color-text)">{t('safetyNotice.title')}</p>
      <ul className="list-disc space-y-1 pl-4">
        <li>{t('safetyNotice.item1')}</li>
        <li>{t('safetyNotice.item2')}</li>
        <li>{t('safetyNotice.item3')}</li>
        <li>{t('safetyNotice.item4')}</li>
      </ul>
    </div>
  );
}
