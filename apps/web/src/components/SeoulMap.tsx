import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Map as KakaoMap,
  MapMarker,
  MarkerClusterer,
  Polygon,
  useKakaoLoader,
  CustomOverlayMap,
} from 'react-kakao-maps-sdk';
import {
  fetchEvents,
  fetchRegions,
  type BffEventItem,
  type EventListQuery,
  type RegionItem,
} from '../lib/api';
import { Icon } from './Icon';

/** GeoJSON 데이터 타입 (필요한 서브셋만). southkorea/seoul-maps 형식. */
interface SeoulGuFeature {
  type: 'Feature';
  properties: { name: string; [k: string]: unknown };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}
interface SeoulGuGeoJson {
  type: 'FeatureCollection';
  features: SeoulGuFeature[];
}

/** GeoJSON Polygon 의 외곽 링 → Kakao path. MultiPolygon 이면 첫 외곽 링만 사용. */
function geojsonToKakaoPath(geom: SeoulGuFeature['geometry']): { lat: number; lng: number }[] {
  const ring =
    geom.type === 'Polygon'
      ? (geom.coordinates as number[][][])[0]
      : (geom.coordinates as number[][][][])[0]?.[0];
  if (!ring) return [];
  return ring.map(([lng, lat]) => ({ lat: lat!, lng: lng! }));
}

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

export function SeoulMap({
  filter,
  selectedEventId,
  onSelectEvent,
}: {
  filter?: EventListQuery | null;
  selectedEventId?: string | null;
  onSelectEvent?: (id: string | null) => void;
}) {
  const navigate = useNavigate();
  const appkey = import.meta.env.VITE_KAKAO_MAP_JS_KEY as string | undefined;

  const [loading, error] = useKakaoLoader({
    appkey: appkey ?? '',
    libraries: ['services', 'clusterer'],
  });

  const [pins, setPins] = useState<Pin[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<SeoulGuGeoJson | null>(null);
  const [regions, setRegions] = useState<RegionItem[]>([]);

  // lookups (geojson + regions) — 페이지당 1회.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/data/seoul-gu.geojson', { signal: ctrl.signal })
      .then((r) => r.json() as Promise<SeoulGuGeoJson>)
      .then(setGeojson)
      .catch(() => {
        // 경계 데이터 없어도 지도 자체는 동작 — 조용히 skip.
      });
    fetchRegions(ctrl.signal)
      .then(setRegions)
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // 선택된 regionId → sigungu name → Kakao path.
  const highlightedGu = useMemo(() => {
    if (!geojson || !filter?.regionIds?.length || regions.length === 0) return [];
    const nameById = new Map(regions.map((r) => [r.regionId, r.sigungu ?? '']));
    const names = new Set(
      filter.regionIds.map((id) => nameById.get(id)).filter((n): n is string => !!n),
    );
    if (names.size === 0) return [];
    return geojson.features
      .filter((f) => names.has(f.properties.name))
      .map((f) => ({ name: f.properties.name, path: geojsonToKakaoPath(f.geometry) }));
  }, [geojson, regions, filter?.regionIds]);

  // 필터 없으면 기본값: 진행중+예정. 필터 있으면 해당 쿼리 + limit 500.
  const query = useMemo<EventListQuery>(
    () => (filter ? { ...filter, limit: PIN_LIMIT } : { phases: ['ongoing', 'upcoming'], limit: PIN_LIMIT }),
    [filter],
  );
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  // selected 는 AppShell 이 관리 — onSelectEvent 호출로 상향. 로컬 popup 은 pin 객체 참조.
  const selectedPin = useMemo(
    () => (selectedEventId ? pins.find((p) => p.id === selectedEventId) ?? null : null),
    [selectedEventId, pins],
  );

  useEffect(() => {
    if (!appkey) return;
    const ctrl = new AbortController();
    setFetchError(null);
    fetchEvents(query, ctrl.signal)
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
    // queryKey 로 의존성 안정화 — query 객체 참조 변경돼도 실제 값 바뀔 때만 refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appkey, queryKey]);

  if (!appkey) return <MissingKeyNotice />;
  if (error) return <LoaderErrorNotice error={error} />;
  if (loading) return <LoadingNotice />;

  return (
    <div className="relative h-full w-full">
      <KakaoMap
        center={SEOUL_CENTER}
        level={DEFAULT_LEVEL}
        style={{ width: '100%', height: '100%' }}
        aria-label="서울 이벤트 지도"
        onClick={() => onSelectEvent?.(null)}
      >
        {highlightedGu.map((gu) => (
          <Polygon
            key={gu.name}
            path={gu.path}
            strokeWeight={3}
            strokeColor="#E8562D"
            strokeOpacity={0.9}
            strokeStyle="solid"
            fillColor="#E8562D"
            fillOpacity={0.08}
          />
        ))}
        <MarkerClusterer averageCenter minLevel={6} disableClickZoom={false}>
          {pins.map((p) => (
            <MapMarker
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              title={p.title}
              onClick={() => onSelectEvent?.(p.id)}
            />
          ))}
        </MarkerClusterer>
        {selectedPin && (
          <CustomOverlayMap position={{ lat: selectedPin.lat, lng: selectedPin.lng }} yAnchor={1.2}>
            <PinPopup
              pin={selectedPin}
              onClose={() => onSelectEvent?.(null)}
              onOpen={() => navigate(`/events/${selectedPin.id}`)}
            />
          </CustomOverlayMap>
        )}
      </KakaoMap>
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
