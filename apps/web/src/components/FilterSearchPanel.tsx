import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createSubscription,
  fetchEvents,
  fetchRegions,
  fetchVibes,
  type EventListQuery,
  type EventListResponse,
  type RegionItem,
  type VibeItem,
} from '../lib/api';
import { useCurrentUser } from '../lib/auth-context';
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

export function FilterSearchPanel({
  onApplied,
  onReset,
  onRegionSelectionChange,
  onSelectEvent,
  activeEventId,
}: {
  /** 적용 시 상위(AppShell) 에 전체 쿼리 전달 — 지도 핀 refetch 에 사용. */
  onApplied?: (query: EventListQuery) => void;
  /** 초기화 시 상위 지도 필터 해제. */
  onReset?: () => void;
  /** 지역 chip 클릭 즉시 발행 — 지도 폴리곤 하이라이트 (적용 대기 X). */
  onRegionSelectionChange?: (regionIds: string[]) => void;
  /** 결과 카드 클릭 시 요약 패널 열기 (navigate 대신). */
  onSelectEvent?: (id: string) => void;
  activeEventId?: string | null;
}) {
  const { t } = useTranslation('navigation');
  const { user } = useCurrentUser();

  // 동적 필터 배열 — 언어 전환 시 즉시 재렌더됨
  const PERIODS = [
    { k: 'today',   l: t('filter.period.today') },
    { k: 'weekend', l: t('filter.period.weekend') },
    { k: 'week',    l: t('filter.period.week') },
    { k: 'month',   l: t('filter.period.month') },
  ];
  const COMPANIONS = [
    { k: 'solo',   l: t('filter.companion.solo') },
    { k: 'couple', l: t('filter.companion.couple') },
    { k: 'family', l: t('filter.companion.family') },
    { k: 'friend', l: t('filter.companion.friend') },
  ];
  const TYPES = [
    { k: 'festival',    l: t('filter.eventType.festival') },
    { k: 'expo',        l: t('filter.eventType.expo') },
    { k: 'symposium',   l: t('filter.eventType.symposium') },
    { k: 'conference',  l: t('filter.eventType.conference') },
    { k: 'exhibition',  l: t('filter.eventType.exhibition') },
    { k: 'performance', l: t('filter.eventType.performance') },
    { k: 'education',   l: t('filter.eventType.education') },
    { k: 'movie',       l: t('filter.eventType.movie') },
  ];

  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [vibes, setVibes] = useState<VibeItem[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [region, setRegion] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<string | null>(null);
  const [companion, setCompanion] = useState<Set<string>>(new Set());
  const [type, setType] = useState<Set<string>>(new Set());
  const [vibe, setVibe] = useState<Set<string>>(new Set());

  const [applied, setApplied] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeMsg, setSubscribeMsg] = useState<string | null>(null);
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

  /** sido 별 그룹: { 시도명: [그 시도의 시/군/구 행 배열] }. 광역 row(sigungu=null) 는 제외. */
  const regionsBySido = useMemo(() => {
    const map = new Map<string, RegionItem[]>();
    for (const r of regions) {
      if (r.sigungu === null) continue;
      const list = map.get(r.sido) ?? [];
      list.push(r);
      map.set(r.sido, list);
    }
    return Array.from(map.entries()).map(([sido, items]) => ({ sido, items }));
  }, [regions]);

  /** 어떤 sido 섹션이 펼쳐져 있는지. 기본은 서울만 펼침 (기존 UX 유지). */
  const [expandedSido, setExpandedSido] = useState<Set<string>>(new Set(['서울']));
  const toggleSido = (sido: string) => {
    setExpandedSido((prev) => {
      const next = new Set(prev);
      if (next.has(sido)) next.delete(sido);
      else next.add(sido);
      return next;
    });
  };

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

  // 지역 chip 이 바뀔 때마다 상위(지도 폴리곤) 에 즉시 broadcast.
  useEffect(() => {
    onRegionSelectionChange?.(Array.from(region));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const totalActive = region.size + (period ? 1 : 0) + companion.size + type.size + vibe.size;

  const reset = () => {
    setRegion(new Set());
    setPeriod(null);
    setCompanion(new Set());
    setType(new Set());
    setVibe(new Set());
    setApplied(false);
    setListState({ loading: false, error: null, data: null });
    onReset?.();
  };

  const subscribe = async () => {
    setSubscribing(true);
    setSubscribeMsg(null);
    // period chip 은 1/3/6/전체 인데 DB 구독은 periodMonths 숫자. 대략 매핑.
    const periodMonthsMap: Record<string, number | null> = {
      today: 1,
      weekend: 1,
      week: 1,
      month: 3,
    };
    const periodMonths = period ? periodMonthsMap[period] ?? null : null;
    try {
      await createSubscription({
        regionIds: Array.from(region),
        companions: Array.from(companion) as ('solo' | 'couple' | 'friend' | 'family')[],
        eventTypes: Array.from(type),
        vibeIds: Array.from(vibe),
        periodMonths,
      });
      setSubscribeMsg(t('subscription.created'));
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'UNAUTHENTICATED') setSubscribeMsg(t('subscription.loginRequired'));
      else if (msg === 'MAX_SUBSCRIPTIONS_REACHED') setSubscribeMsg(t('filter.subscribe.maxReached'));
      else setSubscribeMsg(t('filter.subscribe.failed', { msg }));
    } finally {
      setSubscribing(false);
    }
  };

  const apply = () => {
    const range = period ? computePeriodRange(period) : null;
    const query: EventListQuery = {
      regionIds: Array.from(region),
      companions: Array.from(companion),
      eventTypes: Array.from(type),
      vibeIds: Array.from(vibe),
      limit: 100,
      ...(range ? { period: 'custom', periodStart: range.start, periodEnd: range.end } : {}),
    };
    setApplied(true);
    setListState({ loading: true, error: null, data: null });
    // 지도 쪽은 상위가 관리 — 별도 rebroadcast
    onApplied?.(query);
    const ctrl = new AbortController();
    fetchEvents(query, ctrl.signal)
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
        <FilterBlock title={t('filter.region.label')} count={region.size}>
          {lookupError ? (
            <div className="text-[12px] text-(--color-error)">{t('filter.region.loadError', { msg: lookupError })}</div>
          ) : regionsBySido.length === 0 ? (
            <div className="text-[12px] text-(--color-text-subtle)">{t('filter.region.loading')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {regionsBySido.map(({ sido, items }) => {
                const expanded = expandedSido.has(sido);
                const selectedCount = items.filter((r) => region.has(r.regionId)).length;
                return (
                  <div key={sido} className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface)">
                    <button
                      type="button"
                      onClick={() => toggleSido(sido)}
                      className="flex w-full items-center justify-between px-3 py-2 text-[13px] font-medium text-(--color-text)"
                    >
                      <span>{sido}{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
                      <span className="text-(--color-text-subtle)">{expanded ? '−' : '+'}</span>
                    </button>
                    {expanded && (
                      <div className="border-t border-(--color-border) px-3 py-2">
                        <ChipGroup
                          items={items.map((r) => ({ k: r.regionId, l: r.sigungu! }))}
                          isActive={(k) => region.has(k)}
                          onToggle={toggleIn(setRegion)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </FilterBlock>
        <FilterBlock title={t('filter.period.label')}>
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
        <FilterBlock title={t('filter.companion.label')} count={companion.size}>
          <ChipGroup items={COMPANIONS} isActive={(k) => companion.has(k)} onToggle={toggleIn(setCompanion)} />
        </FilterBlock>
        <FilterBlock title={t('filter.eventType.label')} count={type.size}>
          <ChipGroup items={TYPES} isActive={(k) => type.has(k)} onToggle={toggleIn(setType)} />
        </FilterBlock>
        <FilterBlock title={t('filter.vibe.label')} count={vibe.size} last>
          {vibes.length === 0 ? (
            <div className="text-[12px] text-(--color-text-subtle)">{t('filter.vibe.loading')}</div>
          ) : (
            <ChipGroup
              items={vibes.map((v) => ({ k: v.vibeId, l: v.name }))}
              isActive={(k) => vibe.has(k)}
              onToggle={toggleIn(setVibe)}
            />
          )}
        </FilterBlock>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-(--color-border) bg-(--color-surface) px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex-1 text-[13px] text-(--color-text-muted)">
            {totalActive === 0 ? (
              <>
                {t('filter.action.hintPrefix')}{' '}
                <strong className="font-semibold text-(--color-text)">{t('filter.action.hintApply')}</strong>
                {t('filter.action.hintSuffix')}
              </>
            ) : (
              <>
                <strong className="tabular font-semibold text-(--color-text)">{totalActive}</strong>
                {t('filter.action.selectedSuffix')}
              </>
            )}
          </div>
          {totalActive > 0 && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-8 items-center rounded-(--radius-md) bg-transparent px-2.5 text-[13px] font-medium text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
            >
              {t('filter.action.reset')}
            </button>
          )}
          {user && totalActive > 0 && (
            <button
              type="button"
              onClick={() => void subscribe()}
              disabled={subscribing}
              title={t('filter.action.subscribeTitle')}
              className="inline-flex h-8 items-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 text-[13px] font-medium text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text) disabled:opacity-40"
            >
              {subscribing ? '…' : t('filter.action.subscribe')}
            </button>
          )}
          <button
            type="button"
            disabled={totalActive === 0}
            onClick={apply}
            className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('filter.action.apply')} <Icon name="arrow" size={14} />
          </button>
        </div>
        {subscribeMsg && (
          <div className="text-[11px] text-(--color-text-subtle)">{subscribeMsg}</div>
        )}
      </div>

      {applied && (
        <div className="flex max-h-[45%] min-h-0 flex-col border-t border-(--color-border)">
          <EventList
            items={items}
            loading={listState.loading}
            error={listState.error}
            activeId={activeEventId ?? null}
            onSelect={(id) => onSelectEvent?.(id)}
            totalLabel={
              listState.data ? t('filter.action.resultCount', { count: listState.data.total.toLocaleString() }) : undefined
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
  const { t } = useTranslation('navigation');
  return (
    <div className={`px-5 py-4 ${last ? '' : 'border-b border-(--color-border)'}`}>
      <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-(--color-text-subtle)">
        {title}
        {count !== undefined && (
          <span className="ml-1 font-medium text-(--color-text-subtle)">({count || t('filter.region.all')})</span>
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
      className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
        active
          ? 'border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
          : 'border-(--color-border) bg-(--color-surface) text-(--color-text) hover:border-(--color-border-hover)'
      } ${className}`}
    >
      {children}
    </button>
  );
}
