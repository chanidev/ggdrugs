import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import * as Dialog from 'seed-design/ui/dialog';
import { Icon, type IconName } from './Icon';
import { fetchEvents, type BffEventItem } from '../lib/api/events.js';
import { searchPlaces, type PlaceItem } from '../lib/api/places.js';

/**
 * QuickSearch — 헤더 빠른검색(⌘K) 커맨드 팔레트.
 * 입력 → 250ms debounce → /events?search (제목) + /places/search (Kakao) 병렬 호출.
 *  - 이벤트 결과 클릭 → /events/:id 상세 이동.
 *  - 장소 결과 클릭   → /?focusLng&focusLat 로 이동 → AppShell 이 SeoulMap 을 해당 좌표로 panTo.
 * 키보드: ↑/↓ 이동, Enter 선택, Esc 닫기(Dialog 처리).
 */
const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

type Row =
  | { kind: 'event'; item: BffEventItem }
  | { kind: 'place'; item: PlaceItem };

export function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState('');
  const [events, setEvents] = useState<BffEventItem[]>([]);
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // 열릴 때 입력 초기화 + 포커스, 닫힐 때 상태 정리.
  useEffect(() => {
    if (open) {
      setQ('');
      setEvents([]);
      setPlaces([]);
      setLoading(false);
      setActive(0);
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // debounce 검색 — 이벤트·장소 병렬. 한쪽 실패해도 다른 쪽은 노출(allSettled).
  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_CHARS) {
      setEvents([]);
      setPlaces([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      void Promise.allSettled([
        fetchEvents({ search: query, limit: 6, phases: ['upcoming', 'ongoing'] }, ctrl.signal),
        searchPlaces(query, ctrl.signal),
      ]).then(([ev, pl]) => {
        if (ctrl.signal.aborted) return;
        setEvents(ev.status === 'fulfilled' ? ev.value.items : []);
        setPlaces(pl.status === 'fulfilled' ? pl.value.items : []);
        setActive(0);
        setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const rows = useMemo<Row[]>(
    () => [
      ...events.map((item) => ({ kind: 'event' as const, item })),
      ...places.map((item) => ({ kind: 'place' as const, item })),
    ],
    [events, places],
  );

  const select = (row: Row) => {
    if (row.kind === 'event') navigate(`/events/${row.item.eventId}`);
    else navigate(`/?focusLng=${row.item.lng}&focusLat=${row.item.lat}`);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rows[active];
      if (r) select(r);
    }
  };

  if (!open) return null;

  const showHint = q.trim().length < MIN_CHARS;
  const noResults = !loading && !showHint && rows.length === 0;
  // 이벤트 블록 다음에 장소가 오므로 keyboard active index 의 장소 offset.
  const placeOffset = events.length;

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content
          className="dialog-fit dialog-w560 overflow-hidden p-0"
          aria-label={t('search.placeholder')}
        >
          {/* 입력 행 */}
          <div className="flex items-center gap-2 border-b border-(--color-border) px-4 py-3">
            <Icon name="search" size={16} />
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('search.placeholder')}
              aria-label={t('search.placeholder')}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-(--color-text) outline-none placeholder:text-(--color-text-subtle)"
            />
            <kbd className="rounded-[3px] border border-(--color-border) bg-(--color-surface) px-[5px] py-[1px] font-mono text-[11px] text-(--color-text-subtle)">
              Esc
            </kbd>
          </div>

          {/* 결과 영역 */}
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {showHint && (
              <p className="px-4 py-6 text-center text-[13px] text-(--color-text-muted)">
                {t('search.hint')}
              </p>
            )}
            {loading && (
              <p className="px-4 py-6 text-center text-[13px] text-(--color-text-muted)">
                {t('search.loading')}
              </p>
            )}
            {noResults && (
              <p className="px-4 py-6 text-center text-[13px] text-(--color-text-muted)">
                {t('search.empty')}
              </p>
            )}

            {events.length > 0 && (
              <Section label={t('search.events')}>
                {events.map((ev, i) => (
                  <ResultRow
                    key={`e-${ev.eventId}`}
                    active={active === i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => select({ kind: 'event', item: ev })}
                    icon="calendar"
                    title={ev.title}
                    subtitle={`${ev.region.fullAddress} · ${ev.startDate}`}
                  />
                ))}
              </Section>
            )}

            {places.length > 0 && (
              <Section label={t('search.places')}>
                {places.map((pl, i) => (
                  <ResultRow
                    key={`p-${pl.lng},${pl.lat}-${i}`}
                    active={active === placeOffset + i}
                    onMouseEnter={() => setActive(placeOffset + i)}
                    onClick={() => select({ kind: 'place', item: pl })}
                    icon="mapPin"
                    title={pl.name}
                    subtitle={pl.roadAddress || pl.address}
                  />
                ))}
              </Section>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-(--color-text-subtle)">
        {label}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  active,
  onClick,
  onMouseEnter,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  icon: IconName;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
        active ? 'bg-(--color-bg)' : 'hover:bg-(--color-bg)'
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-sm) bg-(--color-surface-alt) text-(--color-text-muted)">
        <Icon name={icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-(--color-text)">{title}</span>
        <span className="block truncate text-[12px] text-(--color-text-muted)">{subtitle}</span>
      </span>
    </button>
  );
}
