import type { Phase } from '../data/mock';

const PHASE_MAP: Record<Phase, { label: string; tone: 'accent' | 'info' | 'subtle' }> = {
  upcoming: { label: '예정', tone: 'info' },
  ongoing:  { label: '진행중', tone: 'accent' },
  ended:    { label: '종료', tone: 'subtle' },
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  const p = PHASE_MAP[phase];
  const toneClass =
    p.tone === 'accent'
      ? 'bg-(--color-accent) text-white'
      : p.tone === 'info'
        ? 'bg-(--color-info-bg) text-(--color-info)'
        : 'bg-(--color-surface-alt) text-(--color-text-subtle)';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-(--radius-sm) px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] ${toneClass}`}
    >
      {p.tone === 'accent' && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {p.label}
    </span>
  );
}
