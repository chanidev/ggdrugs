import { useEffect, useMemo, useState } from 'react';
import { PERIODS, COMPANIONS, TYPES } from '../data/mock';
import {
  fetchEvents,
  fetchRegions,
  fetchVibes,
  type EventListResponse,
  type RegionItem,
  type VibeItem,
} from '../lib/api';
import { fromBffItem, type DisplayEvent } from '../lib/event-display';
import { Icon } from './Icon';
import { EventList } from './EventList';

/**
 * FilterSearchPanel — A_202 필터 5종 검색.
 *
 *  - 지역: /regions 의 서울 구 단위 행 (regionId 기반)
 *  - 기간: today/weekend/week/month chip → 로컬에서 [start, end] 계산 → period=custom
 *  - 인원구성: solo/couple/family/friend (BFF enum)
 *  - 종류: festival/expo/symposium/conference
 *  - 성향: /vibes 의 event_vibes 행 (vibeId 기반)
 *
 * 적용 시 /events 호출, 결과를 하단 EventList 에 렌더.
 */

type Range = { start: string; end: string };

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computePeriodRange(key: string): Range | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const add = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  switch (key) {
    case 'today':
      return { start: isoDate(today), end: isoDate(today) };
    case 'weekend': {
      const day = today.getDay(); // 0=Sun ... 6=Sat
      const daysToSat = (6 - day + 7) % 7;
      const sat = add(today, daysToSat);
      const sun = add(sat, 1);
      return { start: isoDate(sat), end: isoDate(sun) };
    }
    case 'week': {
      const day = today.getDay() || 7; // Sunday → 7, 월요일 시작
      const mon = add(today, -(day - 1));
      const sun = add(mon, 6);
      return { start: isoDate(mon), end: isoDate(sun) };
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: isoDate(start), end: isoDate(end) };
    }
    default:
      return null;
  }
}

export function FilterSearchPanel() {
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [vibes, setVibes] = useState<VibeItem[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [region, setRegion] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<string | null>(null);
  const [companion, setCompanion] = useState<Set<string>>(new Set());
  const [type, setType] = useState<Set<string>>(new Set());
  const [vibe, setVibe] = useState<Set<string>>(new Set());

  const [applied, setApplied] = useState(false);
  const [listState, setListState] = useState<{
    loading: boolean;
    error: string | null;
    data: EventListResponse | null;
  }>({ loading: false, error: null, data: null });

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([fetchRegions(ctrl.signal), fetchVibes(ctrl.signal)])
      .then(([rs, vs]) => {
        setRegions(rs);
        setVibes(vs);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setLookupError((err as Error).message);
      });
    return () => ctrl.abort();
  }, []);

  const seoulRegions = useMemo(
    () => regions.filter((r) => r.sido === '서울' && r.sigungu !== null),
    [regions],
  );

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
    setListState({ loading: false, error: null, data: null });
  };

  const apply = () => {
    const range = period ? computePeriodRange(period) : null;
    setApplied(true);
    setListState({ loading: true, error: null, data: null });
    const ctrl = new AbortController();
    fetchEvents(
      {
        regionIds: Array.from(region),
        companions: Array.from(companion),
        eventTypes: Array.from(type),
        vibeIds: Array.from(vibe),
        limit: 100,
        ...(range
          ? { period: 'custom', periodStart: range.start, periodEnd: range.end }
          : {}),
      },
      ctrl.signal,
    )
      .then((data) => setListState({ loading: false, error: null, data }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setListState({ loading: false, error: (err as Error).message, data: null });
      });
  };

  const items: DisplayEvent[] = listState.data?.items.map(fromBffItem) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto">
        <FilterBlock title="지역" count={region.size}>
          {lookupError ? (
            <div className="text-[12px] text-(--color-error)">지역 로드 실패: {lookupError}</div>
          ) : seoulRegions.length === 0 ? (
            <div className="text-[12px] text-(--color-text-subtle)">불러오는 중…</div>
          ) : (
            <ChipGroup
              items={seoulRegions.map((r) => ({ k: r.regionId, l: r.sigungu! }))}
              isActive={(k) => region.has(k)}
              onToggle={toggleIn(setRegion)}
            />
          )}
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
        <FilterBlock title="인원구성" count={companion.size}>
          <ChipGroup items={COMPANIONS} isActive={(k) => companion.has(k)} onToggle={toggleIn(setCompanion)} />
        </FilterBlock>
        <FilterBlock title="종류" count={type.size}>
          <ChipGroup items={TYPES} isActive={(k) => type.has(k)} onToggle={toggleIn(setType)} />
        </FilterBlock>
        <FilterBlock title="성향" count={vibe.size} last>
          {vibes.length === 0 ? (
            <div className="text-[12px] text-(--color-text-subtle)">불러오는 중…</div>
          ) : (
            <ChipGroup
              items={vibes.map((v) => ({ k: v.vibeId, l: v.name }))}
              isActive={(k) => vibe.has(k)}
              onToggle={toggleIn(setVibe)}
            />
          )}
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
          onClick={apply}
          className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          적용 <Icon name="arrow" size={14} />
        </button>
      </div>

      {applied && (
        <div className="flex max-h-[45%] min-h-0 flex-col border-t border-(--color-border)">
          <EventList
            items={items}
            loading={listState.loading}
            error={listState.error}
            totalLabel={
              listState.data ? `${listState.data.total.toLocaleString()}개의 결과` : undefined
            }
          />
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
  items: { k: string; l: string }[];
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
