import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../lib/useLanguage.js';
import type { SupportedLanguage } from '../lib/i18n.js';

/**
 * GG-COMM-013 언어 전환 드롭다운.
 * 선택 즉시 i18n.changeLanguage() + localStorage 저장 → 전 서비스 언어 변경.
 * DESIGN.md: neutralOutline 변형, pill 버튼/보라 그라디언트 금지.
 */
export function LanguageToggle() {
  const { current, setLanguage, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l) => l.code === current) ?? languages[0]!;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (code: SupportedLanguage) => {
    setOpen(false);
    await setLanguage(code);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] text-(--color-text) transition-colors hover:border-(--color-border-hover)"
      >
        {currentLang.nativeLabel}
        <span aria-hidden className="text-[10px] text-(--color-text-subtle)">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="언어 선택"
          className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) shadow-(--shadow-md)"
        >
          {languages.map((lang) => (
            <li key={lang.code} role="option" aria-selected={lang.code === current}>
              <button
                type="button"
                onClick={() => void handleSelect(lang.code)}
                className={`flex w-full items-center px-3 py-2 text-left text-[13px] transition-colors hover:bg-(--color-surface-alt) ${
                  lang.code === current ? 'font-semibold text-(--color-accent)' : 'text-(--color-text)'
                }`}
              >
                {lang.nativeLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
