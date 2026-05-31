import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PhaseBadge } from '../../../components/PhaseBadge';
import {
  fetchAdminEvents,
  fetchVibes,
  putAdminEventVibes,
  type AdminEventItem,
  type VibeItem,
} from '../../../lib/api';

type HasVibesMode = 'false' | 'true' | 'any';

export function EventsTab() {
  const { t } = useTranslation('admin');
  const [hasVibesMode, setHasVibesMode] = useState<HasVibesMode>('false');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [events, setEvents] = useState<AdminEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vibes, setVibes] = useState<VibeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // vibes 목록은 한 번만.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchVibes(ctrl.signal)
      .then(setVibes)
      .catch(() => {
        /* silent — 이벤트 리스트는 별개로 동작 */
      });
    return () => ctrl.abort();
  }, []);

  const reload = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchAdminEvents(
      {
        hasVibes: hasVibesMode,
        page,
        limit,
        ...(q ? { q } : {}),
      },
      ctrl.signal,
    )
      .then((r) => {
        setEvents(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'unknown error');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [hasVibesMode, page, limit, q]);

  useEffect(() => {
    return reload();
  }, [reload]);

  const selected = useMemo(
    () => events.find((e) => e.eventId === selectedId) ?? null,
    [events, selectedId],
  );

  const onSaved = useCallback(
    (eventId: string, nextVibes: AdminEventItem['vibes']) => {
      setEvents((prev) =>
        prev.map((ev) => (ev.eventId === eventId ? { ...ev, vibes: nextVibes } : ev)),
      );
    },
    [],
  );

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const VIBE_FILTERS: { key: HasVibesMode; labelKey: string }[] = [
    { key: 'false', labelKey: 'event.vibeFilter.unassigned' },
    { key: 'any',   labelKey: 'event.vibeFilter.any' },
    { key: 'true',  labelKey: 'event.vibeFilter.assigned' },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-(--radius-md) border border-(--color-border) p-0.5">
            {VIBE_FILTERS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setPage(1);
                  setHasVibesMode(opt.key);
                }}
                className={`h-8 rounded-[6px] px-3 text-[13px] font-medium transition-colors ${
                  hasVibesMode === opt.key
                    ? 'bg-(--color-accent) text-white'
                    : 'text-(--color-text-muted) hover:text-(--color-text)'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQ(qDraft.trim());
            }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              type="text"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder={t('event.searchPlaceholder')}
              className="h-8 w-full min-w-[140px] rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] outline-none focus:border-(--color-border-hover)"
            />
            <button
              type="submit"
              className="h-8 shrink-0 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-[13px] font-medium transition-colors hover:border-(--color-border-hover)"
            >
              {t('event.searchButton')}
            </button>
          </form>
          <span className="ml-auto text-[12px] text-(--color-text-subtle)">
            {t('event.total', { count: total.toLocaleString() })}
          </span>
        </div>

        {error && (
          <div className="mb-3 rounded-(--radius-md) border border-(--color-danger)/30 bg-(--color-danger)/5 p-3 text-[13px] text-(--color-danger)">
            {t('event.loadError')}: {error}
          </div>
        )}

        <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) overflow-hidden">
          {loading && events.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">{t('uploader.loading')}</div>
          ) : events.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-(--color-text-subtle)">{t('event.empty')}</div>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {events.map((ev) => (
                <li key={ev.eventId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(ev.eventId)}
                    className={`flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-(--color-surface-alt) ${
                      selectedId === ev.eventId ? 'bg-(--color-surface-alt)' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <PhaseBadge phase={ev.phase} />
                        <span className="text-[12px] text-(--color-text-subtle)">
                          {ev.category.name} · {ev.region.sido}
                          {ev.region.sigungu ? ` ${ev.region.sigungu}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[14px] font-medium text-(--color-text)">
                        {ev.title}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ev.vibes.length === 0 ? (
                          <span className="text-[11px] text-(--color-text-subtle)">
                            {t('event.noLabel')}
                          </span>
                        ) : (
                          ev.vibes.map((v) => (
                            <span
                              key={v.vibeId}
                              className="inline-flex items-center rounded-(--radius-sm) bg-(--color-surface-alt) px-2 py-0.5 text-[11px] text-(--color-text-muted)"
                            >
                              {v.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 rounded-(--radius-md) border border-(--color-border) px-3 text-[13px] disabled:opacity-40"
            >
              {t('audit.prev')}
            </button>
            <span className="text-[13px] text-(--color-text-muted)">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 rounded-(--radius-md) border border-(--color-border) px-3 text-[13px] disabled:opacity-40"
            >
              {t('audit.next')}
            </button>
          </div>
        )}
      </section>

      <aside className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 md:sticky md:top-4 md:h-fit">
        {selected ? (
          <VibeEditor
            event={selected}
            allVibes={vibes}
            onSaved={(next) => onSaved(selected.eventId, next)}
          />
        ) : (
          <div className="p-6 text-center text-[13px] text-(--color-text-subtle)">
            {t('event.selectHint')}
          </div>
        )}
      </aside>
    </div>
  );
}

function VibeEditor({
  event,
  allVibes,
  onSaved,
}: {
  event: AdminEventItem;
  allVibes: VibeItem[];
  onSaved: (next: AdminEventItem['vibes']) => void;
}) {
  const { t } = useTranslation('admin');
  const initialIds = useMemo(() => new Set(event.vibes.map((v) => v.vibeId)), [event.vibes]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 선택 이벤트 바뀌면 리셋.
  useEffect(() => {
    setSelected(new Set(initialIds));
    setSavedAt(null);
    setErr(null);
  }, [event.eventId, initialIds]);

  const dirty = useMemo(() => {
    if (selected.size !== initialIds.size) return true;
    for (const id of selected) if (!initialIds.has(id)) return true;
    return false;
  }, [selected, initialIds]);

  const byGroup = useMemo(() => {
    const m = new Map<string, VibeItem[]>();
    for (const v of allVibes) {
      const arr = m.get(v.group) ?? [];
      arr.push(v);
      m.set(v.group, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allVibes]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const resp = await putAdminEventVibes(event.eventId, [...selected]);
      onSaved(resp.vibes);
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 border-b border-(--color-border) pb-3">
        <div className="text-[12px] text-(--color-text-subtle)">
          event_id={event.eventId} · {event.phase}
        </div>
        <h2 className="mt-1 text-[16px] font-bold tracking-[-0.01em]">{event.title}</h2>
        <div className="mt-1 text-[12px] text-(--color-text-muted)">
          {event.category.name} · {event.region.sido}
          {event.region.sigungu ? ` ${event.region.sigungu}` : ''} · {event.startDate} ~{' '}
          {event.endDate}
        </div>
        {event.aiSummary && (
          <p className="mt-2 whitespace-pre-wrap text-[12px] leading-[1.6] text-(--color-text-muted)">
            {event.aiSummary}
          </p>
        )}
      </div>

      {allVibes.length === 0 ? (
        <div className="text-[13px] text-(--color-text-subtle)">{t('event.vibeLoadError')}</div>
      ) : (
        <div className="space-y-4">
          {byGroup.map(([group, items]) => (
            <fieldset key={group}>
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-(--color-text-subtle)">
                {group}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {items.map((v) => {
                  const on = selected.has(v.vibeId);
                  return (
                    <label
                      key={v.vibeId}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-(--radius-sm) border px-2.5 py-1 text-[12px] transition-colors ${
                        on
                          ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
                          : 'border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:border-(--color-border-hover) hover:text-(--color-text)'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() => toggle(v.vibeId)}
                      />
                      {v.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-(--color-border) pt-3">
        <div className="text-[12px] text-(--color-text-subtle)">
          {t('event.selectCount', { count: selected.size })}
          {savedAt && !dirty && <span className="ml-2 text-(--color-success)">✓ {t('event.saved')}</span>}
          {err && <span className="ml-2 text-(--color-danger)">{err}</span>}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving || selected.size > 10}
          className="h-8 rounded-(--radius-md) bg-(--color-accent) px-4 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? t('event.saving') : t('event.assignVibes')}
        </button>
      </div>
    </div>
  );
}
