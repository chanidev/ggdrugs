import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

/**
 * Line Monogram 로고 — 정사각 액자 + A 획 + 버밀리언 크로스바.
 * 스펙: DESIGN.md §Brand / Logo. 액자·A는 currentColor, 크로스바만 --color-accent 고정.
 * 최소 사용 24px (이하에서는 색 원으로 대체).
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 84 84"
      fill="none"
      className={className}
      aria-label="Alle"
      role="img"
    >
      <rect x="3" y="3" width="78" height="78" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M22 64 L42 22 L62 64"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="30"
        y1="48"
        x2="54"
        y2="48"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Lockup: [마크] [Alle 워드마크] [SEOUL 로케일 태그].
 * 모바일에서 SEOUL 은 hidden sm:inline 로 드롭.
 */
export function LogoLockup({ className = '' }: { className?: string }) {
  const { t } = useTranslation('common');
  return (
    <Link
      to="/"
      className={`flex items-center gap-2 ${className}`}
      aria-label={t('aria.logoLockup')}
    >
      <LogoMark size={32} className="text-(--color-text)" />
      <span className="font-sans text-h3 font-bold tracking-tight" style={{ letterSpacing: '-0.015em' }}>
        Alle
      </span>
      <span className="hidden font-mono text-caption font-medium uppercase text-(--color-text-subtle) sm:inline" style={{ letterSpacing: '0.2em' }}>
        SEOUL
      </span>
    </Link>
  );
}
