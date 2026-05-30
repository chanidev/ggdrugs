import { useTranslation } from 'react-i18next';
import type { Phase } from '../data/mock';

const TONE_MAP: Record<Phase, 'accent' | 'info' | 'subtle'> = {
  upcoming: 'info',
  ongoing:  'accent',
  ended:    'subtle',
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  const { t } = useTranslation('navigation');
  const tone = TONE_MAP[phase];
  const label = t(`phase.${phase}`);
  const toneClass =
    tone === 'accent'
      ? 'bg-(--color-accent) text-white'
      : tone === 'info'
        ? 'bg-(--color-info-bg) text-(--color-info)'
        : 'bg-(--color-surface-alt) text-(--color-text-subtle)';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-(--radius-sm) px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] ${toneClass}`}
    >
      {tone === 'accent' && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {label}
    </span>
  );
}
