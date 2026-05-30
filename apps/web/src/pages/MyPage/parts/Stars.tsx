import { useTranslation } from 'react-i18next';

export function Stars({ value }: { value: number }) {
  const { t } = useTranslation('mypage');
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span aria-label={t('review.starsAria', { star: clamped })} className="inline-flex shrink-0 items-center gap-0.5 text-(--color-accent)">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden className={i < clamped ? '' : 'text-(--color-border)'}>
          ★
        </span>
      ))}
    </span>
  );
}
