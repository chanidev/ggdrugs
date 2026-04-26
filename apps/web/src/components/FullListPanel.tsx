import { Fragment, useEffect, useState } from 'react';
import {
  fetchEvents,
  fetchEventsStats,
  type EventListResponse,
  type EventsStatsResponse,
  type EventPhase,
  type EventSort,
} from '../lib/api';
import { fromBffItem, type DisplayEvent } from '../lib/event-display';
import { EventList } from './EventList';
import { Icon } from './Icon';

/** v4.8 — Geolocation API 상태. v1: 메모리 cache (한 세션 내 1회 fetch 후 reuse), localStorage persist 안 함 (PII 보호). */
type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'error';

type SelectedKey = string; // 'all' | category code (ex. 'festival')
type PhaseKey = 'all' | EventPhase;

const PHASE_TABS: { key: PhaseKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'upcoming', label: '예정' },
  { key: 'ongoing', label: '진행중' },
  { key: 'ended', label: '종료' },
];

/** v4.4 — 정렬 옵션 표기. 사용자 선택은 localStorage 에 persist. v4.5 — 'distance' 추가 (mapBbox 필요). */
const SORT_OPTIONS: { key: EventSort; label: string }[] = [
  { key: 'ending', label: '종료임박' },
  { key: 'recent', label: '최신' },
  { key: 'popular', label: '인기' },
  { key: 'distance', label: '거리' },
];
const SORT_STORAGE_KEY = 'alle.fullList.sort';

function loadSortPref(): EventSort {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    if (v === 'ending' || v === 'recent' || v === 'popular' || v === 'distance') return v;
  } catch {
    // SSR 또는 storage 차단 환경 — default 로 fallback.
  }
  return 'ending';
}

/**
 * FullListPanel — A_300 전체목록 조회 (+ A_203 예정 이벤트 탭).
 *
 * 상단 phase 탭 + 카테고리 chip + 하단 EventList.
 *  - phase 탭: /events/stats.phases 로 count 표시, 선택 시 /events?phases=<phase>.
 *  - 카테고리 chip: /events/stats.categories 로 count 표시, 선택 시 /events?eventTypes=<code>.
 *  - phase · category 는 교집합 (AND).
 */
export function FullListPanel({
  activeEventId,
  onSelect,
  mapBbox,
}: {
  activeEventId?: string | null;
  /** 카드 클릭 시 호출 — navigate 대신 요약 패널을 여는 상위 핸들러. */
  onSelect?: (id: string) => void;
  /** v4.5 — SeoulMap viewport bbox. distance sort 활성 시 BFF 의 anchor 로 사용 (BFF 가 center 자동 계산). null 이면 distance 옵션 disabled. */
  mapBbox?: string | null;
}) {
  const [stats, setStats] = useState<EventsStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedKey>('all');
  const [phase, setPhase] = useState<PhaseKey>('all');
  const [sort, setSort] = useState<EventSort>(() => loadSortPref());
  // v4.8 — GPS opt-in. 권한 prompt 는 사용자 button 클릭 시에만, 좌표는 메모리만 (PII).
  const [gpsAnchor, setGpsAnchor] = useState<{ lng: number; lat: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [listState, setListState] = useState<{
    loading: boolean;
    error: string | null;
    data: EventListResponse | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    const ctrl = new AbortController();
    fetchEventsStats(ctrl.signal)
      .then(setStats)
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setStatsError((err as Error).message);
      });
    return () => ctrl.abort();
  }, []);

  // v4.5 — saved sort 가 'distance' 인데 mapBbox / gpsAnchor 둘 다 없으면 fetch 만 'ending' fallback.
  // v4.8 — gpsAnchor 가 있으면 distance 활성화 가능 (mapBbox 없어도 OK).
  const distanceReady = Boolean(mapBbox || gpsAnchor);
  const effectiveSort: EventSort = sort === 'distance' && !distanceReady ? 'ending' : sort;
  const anchorParam = gpsAnchor ? `${gpsAnchor.lng},${gpsAnchor.lat}` : null;

  useEffect(() => {
    const ctrl = new AbortController();
    setListState({ loading: true, error: null, data: null });
    fetchEvents(
      {
        eventTypes: selected === 'all' ? [] : [selected],
        phases: phase === 'all' ? [] : [phase],
        limit: 100,
        sort: effectiveSort,
        // v4.8 — anchor priority 는 BFF 가 처리: explicit anchor > region centroid > bbox center.
        // GPS 활성 시 anchor 직접 전달 → BFF 가 GPS 우선 사용.
        ...(effectiveSort === 'distance' && anchorParam ? { anchor: anchorParam } : {}),
        ...(effectiveSort === 'distance' && !anchorParam && mapBbox ? { bbox: mapBbox } : {}),
      },
      ctrl.signal,
    )
      .then((data) => setListState({ loading: false, error: null, data }))
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setListState({ loading: false, error: (err as Error).message, data: null });
      });
    return () => ctrl.abort();
  }, [selected, phase, effectiveSort, mapBbox, anchorParam]);

  // v4.4 — 사용자 정렬 선택을 localStorage 에 persist (다음 세션 유지).
  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sort);
    } catch {
      // storage 차단 — 무시.
    }
  }, [sort]);

  /**
   * v4.8 — GPS opt-in 클릭 핸들러. 권한 prompt → 성공 시 좌표 set + sort='distance' 자동 활성.
   * 권한 거부 / 실패 / 미지원 시 status 만 표시 (toast 없음 — 인라인 라벨로 처리).
   * 좌표는 메모리에만 — localStorage / cookie persist 안 함 (PII).
   */
  const requestGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unsupported');
      return;
    }
    setGpsStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsAnchor({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        setGpsStatus('granted');
        // GPS 받은 직후 사용자가 거리 정렬을 의도했다고 가정 — 자동 sort='distance'.
        setSort('distance');
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const clearGps = () => {
    setGpsAnchor(null);
    setGpsStatus('idle');
  };

  const chips: { key: SelectedKey; label: string; count: number | null }[] = [
    { key: 'all', label: '전체', count: stats?.total ?? null },
    ...(stats?.categories.map((c) => ({ key: c.code, label: c.label, count: c.count })) ?? []),
  ];

  const phaseCount = (k: PhaseKey): number | null => {
    if (!stats) return null;
    if (k === 'all') return stats.total;
    return stats.phases[k] ?? 0;
  };

  const items: DisplayEvent[] = listState.data?.items.map(fromBffItem) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Editorial status strip — 종이 지도 범례 감성.
          4 equal tabs 대신 한 줄 인라인 문장 (middot 구분),
          숫자는 mono tabular, active 는 버밀리언 dot. */}
      <div
        role="tablist"
        aria-label="이벤트 진행 단계"
        className="flex shrink-0 flex-wrap items-center gap-y-1 border-b border-(--color-border) bg-(--color-surface) px-5 py-2.5"
      >
        {PHASE_TABS.map((t, i) => {
          const active = phase === t.key;
          const count = phaseCount(t.key);
          return (
            <Fragment key={t.key}>
              {i > 0 && (
                <span
                  aria-hidden
                  className="select-none px-1 text-[12px] text-(--color-text-subtle)"
                >
                  ·
                </span>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPhase(t.key)}
                className={`group inline-flex items-center gap-1.5 rounded-(--radius-sm) px-1.5 py-0.5 text-[13px] transition-colors ${
                  active
                    ? 'text-(--color-accent)'
                    : 'text-(--color-text-muted) hover:text-(--color-text)'
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-(--color-accent)"
                  />
                )}
                <span className={active ? 'font-semibold' : 'font-medium'}>{t.label}</span>
                {count !== null && (
                  <span
                    className={`font-mono text-[12px] tabular ${
                      active
                        ? 'text-(--color-accent)'
                        : 'text-(--color-text-subtle) group-hover:text-(--color-text-muted)'
                    }`}
                  >
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            </Fragment>
          );
        })}
      </div>
      {/* v4.4 — 정렬 segmented control. localStorage persist. v4.8 — GPS opt-in 버튼 + status 라벨. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-(--color-border) px-5 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-(--color-text-subtle)">
          정렬
        </span>
        <div className="flex items-center gap-2">
          <GpsButton
            status={gpsStatus}
            anchored={gpsAnchor !== null}
            onRequest={requestGps}
            onClear={clearGps}
          />
          <div role="radiogroup" aria-label="정렬 기준" className="inline-flex items-center gap-0.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface-alt) p-0.5">
            {SORT_OPTIONS.map((opt) => {
              const active = sort === opt.key;
              // v4.5 — distance 옵션은 mapBbox 또는 gpsAnchor 가 있어야 활성.
              const disabled = opt.key === 'distance' && !distanceReady;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-disabled={disabled}
                  disabled={disabled}
                  title={disabled ? '지도 활성화 또는 내 위치 사용 시 활성' : undefined}
                  onClick={() => {
                    if (disabled) return;
                    setSort(opt.key);
                  }}
                  className={`inline-flex h-7 items-center rounded-(--radius-sm) px-2.5 text-[12px] font-medium transition-colors ${
                    disabled
                      ? 'cursor-not-allowed text-(--color-text-subtle) opacity-60'
                      : active
                        ? 'bg-(--color-surface) text-(--color-accent) shadow-(--shadow-sm)'
                        : 'text-(--color-text-muted) hover:text-(--color-text)'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-(--color-border) px-5 py-3">
        {chips.map((c) => {
          const active = selected === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(c.key)}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${
                active
                  ? 'border-(--color-accent) bg-(--color-accent-bg) text-(--color-accent)'
                  : 'border-(--color-border) bg-(--color-surface) text-(--color-text) hover:border-(--color-border-hover)'
              }`}
            >
              {c.label}
              {c.count !== null && (
                <span
                  className={`tabular ml-1 font-medium ${
                    active ? 'text-(--color-accent)' : 'text-(--color-text-subtle)'
                  }`}
                >
                  {c.count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
        {statsError && (
          <span className="ml-auto self-center text-[11px] text-(--color-error)">
            stats 로드 실패
          </span>
        )}
      </div>
      <EventList
        items={items}
        loading={listState.loading}
        error={listState.error}
        activeId={activeEventId ?? null}
        onSelect={(id) => onSelect?.(id)}
        totalLabel={
          listState.data ? `${listState.data.total.toLocaleString()}개의 이벤트` : undefined
        }
      />
    </div>
  );
}

/**
 * v4.8 — GPS opt-in 버튼. idle/granted/denied/error/unsupported 5 상태.
 * granted 시 vermillion 배경 + 좌표 사용 중 표시. denied/error 는 인라인 텍스트로 신호.
 */
function GpsButton({
  status,
  anchored,
  onRequest,
  onClear,
}: {
  status: GpsStatus;
  anchored: boolean;
  onRequest: () => void;
  onClear: () => void;
}) {
  if (status === 'requesting') {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-alt) px-2 text-[11px] font-medium text-(--color-text-muted)">
        <Icon name="sparkles" size={12} />
        위치 확인 중…
      </span>
    );
  }
  if (anchored && status === 'granted') {
    return (
      <button
        type="button"
        onClick={onClear}
        title="내 위치 anchor 해제"
        className="inline-flex h-7 items-center gap-1 rounded-(--radius-sm) border border-(--color-accent) bg-(--color-accent-bg) px-2 text-[11px] font-medium text-(--color-accent) transition-colors hover:bg-(--color-accent)/10"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
        내 위치 ON
      </button>
    );
  }
  const denied = status === 'denied';
  const errored = status === 'error';
  const unsupported = status === 'unsupported';
  return (
    <button
      type="button"
      onClick={onRequest}
      disabled={unsupported}
      title={
        denied
          ? '권한이 거부됨 — 브라우저 설정에서 허용 후 다시 시도'
          : errored
            ? '위치 가져오기 실패 — 다시 시도'
            : unsupported
              ? '브라우저가 위치 서비스를 지원하지 않음'
              : '내 위치를 거리 정렬의 기준점으로 사용'
      }
      className={`inline-flex h-7 items-center gap-1 rounded-(--radius-sm) border px-2 text-[11px] font-medium transition-colors ${
        unsupported
          ? 'cursor-not-allowed border-(--color-border) bg-(--color-surface-alt) text-(--color-text-subtle) opacity-60'
          : denied || errored
            ? 'border-(--color-error)/50 bg-(--color-error)/5 text-(--color-error) hover:bg-(--color-error)/10'
            : 'border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:border-(--color-accent) hover:text-(--color-accent)'
      }`}
    >
      <Icon name="sparkles" size={12} />
      {denied ? '권한 거부됨' : errored ? '재시도' : unsupported ? '미지원' : '내 위치'}
    </button>
  );
}
