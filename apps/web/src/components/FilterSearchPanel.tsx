import { useState } from 'react';
import { REGIONS, PERIODS, COMPANIONS, TYPES, VIBES, type FilterKey } from '../data/mock';
import { Icon } from './Icon';
import { EventList } from './EventList';

/**
 * FilterSearchPanel — 필터 5종 (지역·기간·인원구성·종류·성향).
 *
 * UX:
 *  - chip toggle (지역/인원/종류/성향 = multi, 기간 = single).
 *  - 하단 apply bar: 선택 카운트 요약 + 초기화 + 적용 버튼.
 *  - 적용 후 하단에 결과 EventList 펼침 (max-h 45%).
 */
export function FilterSearchPanel() {
  const [region, setRegion] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<string | null>(null);
  const [companion, setCompanion] = useState<Set<string>>(new Set());
  const [type, setType] = useState<Set<string>>(new Set());
  const [vibe, setVibe] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (k: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });
      setApplied(false);
    };

  const totalActive = region.size + (period ? 1 : 0) + companion.size + type.size + vibe.size;

  const reset = () => {
    setRegion(new Set());
    setPeriod(null);
    setCompanion(new Set());
    setType(new Set());
    setVibe(new Set());
    setApplied(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto">
        <FilterBlock title="지역" count={region.size}>
          <ChipGroup items={REGIONS} isActive={(k) => region.has(k)} onToggle={toggleIn(setRegion)} />
        </FilterBlock>
        <FilterBlock title="기간">
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <Chip
                key={p.k}
                active={period === p.k}
                onClick={() => {
                  setPeriod(period === p.k ? null : p.k);
                  setApplied(false);
                }}
                className="flex-1 justify-center"
              >
                {p.l}
              </Chip>
            ))}
          </div>
        </FilterBlock>
        <FilterBlock title="인원구성">
          <ChipGroup items={COMPANIONS} isActive={(k) => companion.has(k)} onToggle={toggleIn(setCompanion)} />
        </FilterBlock>
        <FilterBlock title="종류">
          <ChipGroup items={TYPES} isActive={(k) => type.has(k)} onToggle={toggleIn(setType)} />
        </FilterBlock>
        <FilterBlock title="성향" last>
          <ChipGroup items={VIBES} isActive={(k) => vibe.has(k)} onToggle={toggleIn(setVibe)} />
        </FilterBlock>
      </div>

      <div className="flex items-center gap-2.5 border-t border-(--color-border) bg-(--color-surface) px-5 py-3.5">
        <div className="flex-1 text-[13px] text-(--color-text-muted)">
          {totalActive === 0 ? (
            <>
              필터를 선택하면 <strong className="font-semibold text-(--color-text)">적용</strong>할 수 있어요
            </>
          ) : (
            <>
              <strong className="tabular font-semibold text-(--color-text)">{totalActive}</strong>
              개 조건 선택됨
            </>
          )}
        </div>
        {totalActive > 0 && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-8 items-center rounded-(--radius-md) bg-transparent px-2.5 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
          >
            초기화
          </button>
        )}
        <button
          type="button"
          disabled={totalActive === 0}
          onClick={() => setApplied(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          적용 <Icon name="arrow" size={14} />
        </button>
      </div>

      {applied && (
        <div className="flex max-h-[45%] min-h-0 flex-col border-t border-(--color-border)">
          <EventList />
        </div>
      )}
    </div>
  );
}

function FilterBlock({
  title,
  count,
  last,
  children,
}: {
  title: string;
  count?: number;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`px-5 py-4 ${last ? '' : 'border-b border-(--color-border)'}`}>
      <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-(--color-text-subtle)">
        {title}
        {count !== undefined && (
          <span className="ml-1 font-medium text-(--color-text-subtle)">({count || '전체'})</span>
        )}
      </div>
      {children}
    </div>
  );
}

function ChipGroup({
  items,
  isActive,
  onToggle,
}: {
  items: FilterKey[];
  isActive: (k: string) => boolean;
  onToggle: (k: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <Chip key={it.k} active={isActive(it.k)} onClick={() => onToggle(it.k)}>
          {it.l}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  className = '',
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-[30px] items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
        active
          ? 'border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
          : 'border-(--color-border) bg-(--color-surface) text-(--color-text) hover:border-(--color-border-hover)'
      } ${className}`}
    >
      {children}
    </button>
  );
}
