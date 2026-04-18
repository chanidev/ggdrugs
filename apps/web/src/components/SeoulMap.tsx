import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Map,
  MapMarker,
  MarkerClusterer,
  useKakaoLoader,
  CustomOverlayMap,
} from 'react-kakao-maps-sdk';
import { fetchEvents, type BffEventItem } from '../lib/api';
import { Icon } from './Icon';

/**
 * SeoulMap — Kakao Maps 기반 서울 이벤트 지도.
 *
 * Env: VITE_KAKAO_MAP_JS_KEY (공개 JavaScript 키).
 *
 * Pin 소스:
 *  - /events?phases=ongoing,upcoming&limit=500 → 진행중·예정 이벤트만
 *  - lat/lng null 인 행은 제외
 *  - MarkerClusterer 로 줌 레벨에 따라 클러스터 묶음
 *
 * Pin 클릭 → CustomOverlayMap 으로 간단 팝업 (제목 + 기간). 상세는 Phase 2.
 */

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const DEFAULT_LEVEL = 8;
const PIN_LIMIT = 500;

interface Pin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  dateRange: string;
  phase: BffEventItem['phase'];
}

function toPin(item: BffEventItem): Pin | null {
  if (item.latitude === null || item.longitude === null) return null;
  return {
    id: item.eventId,
    lat: item.latitude,
    lng: item.longitude,
    title: item.title,
    dateRange: item.startDate === item.endDate ? item.startDate : `${item.startDate} ~ ${item.endDate}`,
    phase: item.phase,
  };
}

export function SeoulMap() {
  const navigate = useNavigate();
  const appkey = import.meta.env.VITE_KAKAO_MAP_JS_KEY as string | undefined;

  const [loading, error] = useKakaoLoader({
    appkey: appkey ?? '',
    libraries: ['services', 'clusterer'],
  });

  const [pins, setPins] = useState<Pin[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Pin | null>(null);

  useEffect(() => {
    if (!appkey) return;
    const ctrl = new AbortController();
    fetchEvents({ phases: ['ongoing', 'upcoming'], limit: PIN_LIMIT }, ctrl.signal)
      .then((res) => {
        const next: Pin[] = [];
        for (const it of res.items) {
          const p = toPin(it);
          if (p) next.push(p);
        }
        setPins(next);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setFetchError((err as Error).message);
      });
    return () => ctrl.abort();
  }, [appkey]);

  if (!appkey) return <MissingKeyNotice />;
  if (error) return <LoaderErrorNotice error={error} />;
  if (loading) return <LoadingNotice />;

  return (
    <div className="relative h-full w-full">
      <Map
        center={SEOUL_CENTER}
        level={DEFAULT_LEVEL}
        style={{ width: '100%', height: '100%' }}
        aria-label="서울 이벤트 지도"
        onClick={() => setSelected(null)}
      >
        <MarkerClusterer averageCenter minLevel={6} disableClickZoom={false}>
          {pins.map((p) => (
            <MapMarker
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              title={p.title}
              onClick={() => setSelected(p)}
            />
          ))}
        </MarkerClusterer>
        {selected && (
          <CustomOverlayMap position={{ lat: selected.lat, lng: selected.lng }} yAnchor={1.2}>
            <PinPopup
              pin={selected}
              onClose={() => setSelected(null)}
              onOpen={() => navigate(`/events/${selected.id}`)}
            />
          </CustomOverlayMap>
        )}
      </Map>
      <StatusBadge count={pins.length} error={fetchError} />
    </div>
  );
}

function PinPopup({
  pin,
  onClose,
  onOpen,
}: {
  pin: Pin;
  onClose: () => void;
  onOpen: () => void;
}) {
  const phaseLabel = pin.phase === 'ongoing' ? '진행중' : pin.phase === 'upcoming' ? '예정' : '종료';
  const tone =
    pin.phase === 'ongoing'
      ? 'bg-(--color-accent) text-white'
      : pin.phase === 'upcoming'
        ? 'bg-[rgba(58,110,165,0.12)] text-(--color-info)'
        : 'bg-(--color-surface-alt) text-(--color-text-subtle)';
  return (
    <div className="relative w-[280px] rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3.5 shadow-(--shadow-lg)">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-[1.3] tracking-[-0.01em]">
          {pin.title}
        </h3>
        <span className={`inline-flex shrink-0 items-center rounded-(--radius-sm) px-2 py-[3px] text-[11px] font-semibold ${tone}`}>
          {phaseLabel}
        </span>
      </div>
      <p className="tabular m-0 mb-3 text-[12px] text-(--color-text-muted)">{pin.dateRange}</p>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
      >
        상세 보기 <Icon name="arrow" size={13} />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="팝업 닫기"
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-(--radius-md) text-(--color-text-subtle) hover:bg-(--color-surface-alt) hover:text-(--color-text)"
      >
        ×
      </button>
    </div>
  );
}

function StatusBadge({ count, error }: { count: number; error: string | null }) {
  if (error) {
    return (
      <div className="absolute bottom-24 left-4 z-10 rounded-(--radius-md) bg-(--color-error) px-3 py-1.5 text-[12px] font-medium text-white shadow-(--shadow-md)">
        지도 핀 로드 실패: {error.slice(0, 80)}
      </div>
    );
  }
  return (
    <div className="absolute left-4 top-4 z-10 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[12px] font-medium text-(--color-text-muted) shadow-(--shadow-sm)">
      <span className="tabular text-(--color-text)">{count.toLocaleString()}</span>개 이벤트 표시
    </div>
  );
}

function MissingKeyNotice() {
  return (
    <NoticeBox tone="warning">
      <p className="font-semibold">Kakao Maps 키 없음</p>
      <p className="text-body-sm text-(--color-text-muted)">
        <code className="rounded-sm bg-(--color-surface) px-1 py-0.5">.env</code> 파일에{' '}
        <code className="rounded-sm bg-(--color-surface) px-1 py-0.5">VITE_KAKAO_MAP_JS_KEY</code>를 설정하고 dev 서버 재시작.
      </p>
    </NoticeBox>
  );
}

function LoaderErrorNotice({ error }: { error: unknown }) {
  let msg: string;
  let scriptSrc: string | null = null;
  if (error instanceof Event) {
    const target = error.target as HTMLScriptElement | null;
    scriptSrc = target?.src ?? null;
    msg = scriptSrc ? `스크립트 로드 실패: ${scriptSrc}` : '스크립트 로드 실패 (event target 없음)';
  } else if (error instanceof Error) {
    msg = error.message;
  } else {
    msg = String(error);
  }
  return (
    <NoticeBox tone="error">
      <p className="font-semibold">지도 로드 실패</p>
      <p className="text-body-sm text-(--color-text-muted)">{msg}</p>
      <ul className="ml-4 list-disc space-y-1 text-body-sm text-(--color-text-muted)">
        <li>Kakao 개발자 콘솔의 앱이 <b>JavaScript 키</b>인지 확인 (REST API 키 X)</li>
        <li>허용 도메인에 <code>http://localhost:5173</code> 등록 확인</li>
        <li>브라우저 F12 → Network 탭에서 sdk.js 요청 status 확인</li>
      </ul>
    </NoticeBox>
  );
}

function LoadingNotice() {
  return (
    <div className="flex h-full items-center justify-center bg-(--color-surface-alt)">
      <p className="text-body-sm text-(--color-text-muted)">지도 로딩…</p>
    </div>
  );
}

function NoticeBox({ tone, children }: { tone: 'warning' | 'error'; children: React.ReactNode }) {
  const bg =
    tone === 'warning'
      ? 'bg-(--color-warning)/10 border-(--color-warning)'
      : 'bg-(--color-error)/10 border-(--color-error)';
  return (
    <div className="flex h-full items-center justify-center bg-(--color-surface-alt) p-8">
      <div className={`max-w-md rounded-(--radius-lg) border-l-4 bg-(--color-surface) p-6 shadow-(--shadow-md) ${bg}`}>
        {children}
      </div>
    </div>
  );
}
