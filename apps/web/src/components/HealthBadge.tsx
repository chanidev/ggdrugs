import { useEffect, useState } from 'react';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; env: string }
  | { status: 'down'; error: string };

/**
 * HealthBadge — BFF /health 프록시(`/api/health`)에 ping해서 E2E 연결 상태 표시.
 * 개발 중에만 보이는 편의 위젯. Production에서는 제거 예정.
 */
export function HealthBadge() {
  const [state, setState] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { ok: boolean; env?: string };
        if (cancelled) return;
        setState(
          json.ok
            ? { status: 'ok', env: json.env ?? 'unknown' }
            : { status: 'down', error: 'not ok' },
        );
      } catch (e) {
        if (cancelled) return;
        setState({
          status: 'down',
          error: e instanceof Error ? e.message : 'unknown',
        });
      }
    }
    void ping();
    const id = setInterval(ping, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const label =
    state.status === 'loading'
      ? '…'
      : state.status === 'ok'
        ? `BFF ok · ${state.env}`
        : `BFF down: ${state.error}`;

  const tone =
    state.status === 'ok'
      ? 'bg-(--color-success)/10 text-(--color-success)'
      : state.status === 'down'
        ? 'bg-(--color-error)/10 text-(--color-error)'
        : 'bg-(--color-surface-alt) text-(--color-text-muted)';

  return (
    <div
      className={`absolute bottom-[84px] left-6 rounded-full px-3 py-1 text-caption font-medium tabular shadow-(--shadow-sm) ${tone}`}
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}
