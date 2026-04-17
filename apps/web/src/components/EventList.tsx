/**
 * EventList — placeholder. Phase 2에서 GET /events API 연결.
 * 현재는 더미 3건으로 디자인 토큰 검증.
 */
const DUMMY_EVENTS = [
  {
    id: 1,
    title: '서울 빛초롱 축제 2026',
    region: '서울 종로구',
    dateRange: '2026-05-03 ~ 2026-05-18',
    vibes: ['체험형', '가족'],
    phaseLabel: '예정',
    phaseTone: 'info' as const,
  },
  {
    id: 2,
    title: '코리아 콘텐츠 박람회',
    region: '서울 강남구',
    dateRange: '2026-05-12 ~ 2026-05-14',
    vibes: ['네트워킹 중심'],
    phaseLabel: '진행중',
    phaseTone: 'accent' as const,
  },
  {
    id: 3,
    title: 'AI 윤리 심포지움',
    region: '서울 관악구',
    dateRange: '2026-04-20',
    vibes: ['교육형'],
    phaseLabel: '종료',
    phaseTone: 'subtle' as const,
  },
] as const;

type Event = (typeof DUMMY_EVENTS)[number];

export function EventList() {
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-(--color-border)">
      {DUMMY_EVENTS.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </ul>
  );
}

function EventCard({ event }: { event: Event }) {
  return (
    <li className="cursor-pointer p-4 transition-colors hover:bg-(--color-surface-alt)">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-h3 font-semibold leading-tight tracking-tight">
          {event.title}
        </h3>
        <PhaseBadge label={event.phaseLabel} tone={event.phaseTone} />
      </div>
      <p className="mb-1 text-body-sm text-(--color-text-muted)">{event.region}</p>
      <p className="mb-3 text-body-sm tabular text-(--color-text-muted)">
        {event.dateRange}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {event.vibes.map((v) => (
          <span
            key={v}
            className="rounded-full bg-(--color-surface-alt) px-2 py-0.5 text-caption text-(--color-text-muted)"
          >
            {v}
          </span>
        ))}
      </div>
    </li>
  );
}

function PhaseBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'info' | 'accent' | 'subtle';
}) {
  const classes =
    tone === 'accent'
      ? 'bg-(--color-accent-bg) text-(--color-accent)'
      : tone === 'info'
        ? 'bg-(--color-info)/10 text-(--color-info)'
        : 'bg-(--color-surface-alt) text-(--color-text-subtle)';
  return (
    <span
      className={`shrink-0 rounded-sm px-1.5 py-0.5 text-caption font-medium ${classes}`}
    >
      {label}
    </span>
  );
}
