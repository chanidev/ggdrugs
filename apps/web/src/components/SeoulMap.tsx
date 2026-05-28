import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * 전국 시/군/구 GeoJSON 타입 (southkorea-maps `skorea-municipalities-2018-geo.json` 기반,
 * `apps/web/scripts/simplify-geojson.mjs` 로 단순화한 결과).
 * properties: { code: KOSTAT 5자리, name: 공백 없는 sigungu 표기 ("수원시영통구") }.
 */
interface MunicipalityFeature {
  type: 'Feature';
  properties: { code: string; name: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}
interface MunicipalityGeoJson {
  type: 'FeatureCollection';
  features: MunicipalityFeature[];
}

/** KOSTAT 행정코드 첫 2자리 → DB sido_name 단축형. ADR 0006 — 전국 17 시/도. */
const SIDO_CODE_MAP: Record<string, string> = {
  '11': '서울', '21': '부산', '22': '대구', '23': '인천', '24': '광주',
  '25': '대전', '26': '울산', '29': '세종', '31': '경기', '32': '강원',
  '33': '충북', '34': '충남', '35': '전북', '36': '전남', '37': '경북',
  '38': '경남', '39': '제주',
};

/** GeoJSON Polygon 의 외곽 링 → Kakao path. MultiPolygon 이면 첫 외곽 링만 사용. */
function geojsonToKakaoPath(geom: MunicipalityFeature['geometry']): { lat: number; lng: number }[] {
  const ring =
    geom.type === 'Polygon'
      ? (geom.coordinates as number[][][])[0]
      : (geom.coordinates as number[][][][])[0]?.[0];
  if (!ring) return [];
  return ring.map(([lng, lat]) => ({ lat: lat!, lng: lng! }));
}

/** sigungu_name 정규화 — 공백 제거. DB "수원시 영통구" ↔ GeoJSON "수원시영통구" 매칭 키. */
function normalizeSigungu(s: string | null): string {
  return s ? s.replace(/\s+/g, '') : '';
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
 * Pin 클릭 → onSelectEvent 으로 상향 (AppShell 의 EventSummaryPanel 이 요약 렌더).
 *            지도 자체에는 별도 팝업 없음 (단일 진실: selectedEventId).
 */

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const DEFAULT_LEVEL = 8;
const PIN_LIMIT = 500;

/**
 * Cluster tier 스타일 — Kakao clusterer 에 inline-style 로 전달.
 *
 * calculator=[10, 100] → 3 tier:
 *   idx 0: 2~9    (small,  32px)
 *   idx 1: 10~99  (mid,    40px)
 *   idx 2: 100+   (large,  52px)
 *
 * 브랜드 단일 accent (vermilion). tier 별 size + inner border 강도로 위계 표현.
 */
const CLUSTER_CALCULATOR: [number, number] = [10, 100];
const CLUSTER_STYLES = [
  {
    width: '32px',
    height: '32px',
    background: 'rgba(232,86,45,0.92)',
    border: '2px solid rgba(255,255,255,0.9)',
    borderRadius: '50%',
    color: '#fff',
    textAlign: 'center' as const,
    lineHeight: '28px',
    fontSize: '12px',
    fontWeight: '700',
    boxShadow: '0 2px 6px rgba(232,86,45,0.35)',
  },
  {
    width: '40px',
    height: '40px',
    background: 'rgba(232,86,45,0.94)',
    border: '3px solid rgba(255,255,255,0.92)',
    borderRadius: '50%',
    color: '#fff',
    textAlign: 'center' as const,
    lineHeight: '34px',
    fontSize: '13px',
    fontWeight: '700',
    boxShadow: '0 3px 10px rgba(232,86,45,0.4)',
  },
  {
    width: '52px',
    height: '52px',
    background: 'rgba(232,86,45,0.96)',
    border: '4px solid rgba(255,255,255,0.94)',
    borderRadius: '50%',
    color: '#fff',
    textAlign: 'center' as const,
    lineHeight: '44px',
    fontSize: '14px',
    fontWeight: '800',
    boxShadow: '0 4px 14px rgba(232,86,45,0.45)',
  },
];

interface Pin {
  id: string;
  lat: number;
  lng: number;
  title: string;
}

function toPin(item: BffEventItem): Pin | null {
  if (item.latitude === null || item.longitude === null) return null;
  return {
    id: item.eventId,
    lat: item.latitude,
    lng: item.longitude,
    title: item.title,
  };
}

export function SeoulMap({
  filter,
  highlightRegionIds,
  selectedEventId,
  onSelectEvent,
  onBboxChange,
}: {
  filter?: EventListQuery | null;
  /** 필터 chip 클릭 즉시 발행되는 지역 id 목록 — 폴리곤 하이라이트용 (mapFilter 와 분리). */
  highlightRegionIds?: string[];
  selectedEventId?: string | null;
  onSelectEvent?: (id: string | null) => void;
  /** v4.5 — 지도 viewport bbox 가 변경될 때 부모로 lift up. distance sort 의 anchor 로 활용. */
  onBboxChange?: ((bbox: string | null) => void) | undefined;
}) {
  const appkey = import.meta.env.VITE_KAKAO_MAP_JS_KEY as string | undefined;

  const [loading, error] = useKakaoLoader({
    appkey: appkey ?? '',
    libraries: ['services', 'clusterer'],
  });

  const [pins, setPins] = useState<Pin[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<MunicipalityGeoJson | null>(null);
  const [regions, setRegions] = useState<RegionItem[]>([]);
  // v4.3 stage 3 — viewport bbox. 사용자가 panning / zoom 시 300ms debounce 후 갱신.
  // null 인 동안엔 기본 fetch (phases 또는 filter 만 적용) — 첫 idle 후 bbox 등록.
  const [mapBbox, setMapBbox] = useState<string | null>(null);
  const bboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ADR 0006 — 비-서울 region chip 선택 시 지도 panTo anchor. Kakao Map 인스턴스 보관.
  const mapInstanceRef = useRef<kakao.maps.Map | null>(null);

  // lookups (geojson + regions) — 페이지당 1회. ADR 0006: 전국 시/군/구 GeoJSON (~2.7 MB).
  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/data/skorea-municipalities.geojson', { signal: ctrl.signal })
      .then((r) => r.json() as Promise<MunicipalityGeoJson>)
      .then(setGeojson)
      .catch(() => {
        // 경계 데이터 없어도 지도 자체는 동작 — 조용히 skip.
      });
    fetchRegions(ctrl.signal)
      .then(setRegions)
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // 선택된 regionId → (sido, 정규화 sigungu) 키 → GeoJSON feature 매칭 → Kakao path.
  //   - DB sigungu "수원시 영통구" (공백) ↔ GeoJSON name "수원시영통구" (무공백): normalizeSigungu 로 정합.
  //   - "중구" 처럼 여러 sido 에 동명 자치구 — feature.code 첫 2자리 → SIDO_CODE_MAP 으로 sido 추출해 disambiguate.
  //   - 광역 row (sigungu=null) 는 chip 으로 노출 안 되니 무시.
  const highlightedGu = useMemo(() => {
    const ids = highlightRegionIds?.length ? highlightRegionIds : filter?.regionIds;
    if (!geojson || !ids?.length || regions.length === 0) return [];
    const targets = ids
      .map((id) => regions.find((r) => r.regionId === id))
      .filter((r): r is RegionItem => !!r && !!r.sigungu)
      .map((r) => ({ sido: r.sido, key: normalizeSigungu(r.sigungu) }));
    if (targets.length === 0) return [];
    return geojson.features
      .filter((f) => {
        const featureSido = SIDO_CODE_MAP[f.properties.code.slice(0, 2)];
        if (!featureSido) return false;
        return targets.some((t) => t.sido === featureSido && t.key === f.properties.name);
      })
      .map((f) => ({ name: f.properties.name, path: geojsonToKakaoPath(f.geometry) }));
  }, [geojson, regions, highlightRegionIds, filter?.regionIds]);

  // ADR 0006 — region chip 클릭 즉시 지도 panTo. 폴리곤이 있든 없든 (서울 외 sido)
  // 시각 반응을 보장. 첫 선택 region 의 center 사용. 광역(sigungu=null)은 줌아웃, 자치구는 줌인.
  // centerLat/Lng 은 BFF 가 자치구 NULL 시 sido 광역으로 COALESCE 해 보장.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || regions.length === 0) return;
    if (!highlightRegionIds || highlightRegionIds.length === 0) return;
    const firstId = highlightRegionIds[0]!;
    const region = regions.find((r) => r.regionId === firstId);
    if (!region || region.centerLat === null || region.centerLng === null) return;
    map.panTo(new kakao.maps.LatLng(region.centerLat, region.centerLng));
    // 광역 row(sigungu=null) 는 시/도 시야로 줌아웃, 자치구·시 row 는 자치구 시야.
    map.setLevel(region.sigungu === null ? 9 : 7);
  }, [highlightRegionIds, regions]);

  // 폴리곤 pulse — Kakao Polygon 은 canvas/svg 라 CSS 애니메이션 불가. React state 로 주기적
  // strokeOpacity / fillOpacity 토글. 하이라이트 있을 때만 interval 돌림.
  const [pulsePhase, setPulsePhase] = useState(0);
  useEffect(() => {
    if (highlightedGu.length === 0) return;
    const id = setInterval(() => setPulsePhase((p) => (p + 1) % 2), 650);
    return () => clearInterval(id);
  }, [highlightedGu.length]);
  const strokeOpacity = pulsePhase === 0 ? 0.95 : 0.4;
  const fillOpacity = pulsePhase === 0 ? 0.12 : 0.04;

  // 필터 없으면 기본값: 진행중+예정. 필터 있으면 해당 쿼리 + limit 500.
  // v4.3 stage 3 — mapBbox 가 set 되면 query 에 bbox 포함 → BFF ST_Within viewport 필터.
  const query = useMemo<EventListQuery>(() => {
    const base: EventListQuery = filter
      ? { ...filter, limit: PIN_LIMIT }
      : { phases: ['ongoing', 'upcoming'], limit: PIN_LIMIT };
    return mapBbox ? { ...base, bbox: mapBbox } : base;
  }, [filter, mapBbox]);
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  // 선택된 핀의 좌표 — 지도 위 강조 overlay 렌더용.
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

  // v4.3 stage 3 — debounce 타이머는 unmount 시 cleanup. v4.5 — 부모에 bbox null emit.
  useEffect(() => {
    return () => {
      if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
      onBboxChange?.(null);
    };
    // onBboxChange 는 stable 가정 (caller 가 useCallback 또는 setState dispatcher 전달).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * v4.3 stage 3 — Kakao Map onBoundsChanged 핸들러.
   * 사용자 panning / zoom 마다 발화 → 300ms debounce 후 bbox state 갱신 → query 변경 →
   * fetchEvents refetch (phases/filter + bbox 결합 → BFF ST_Within).
   * v4.5 — onBboxChange 가 있으면 부모 (AppShell/MobileShell) state 도 lift up
   * (FullListPanel 의 distance sort anchor 활용).
   */
  const handleBoundsChanged = (map: kakao.maps.Map) => {
    if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
    bboxTimerRef.current = setTimeout(() => {
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const bbox = `${sw.getLng()},${sw.getLat()},${ne.getLng()},${ne.getLat()}`;
      setMapBbox(bbox);
      onBboxChange?.(bbox);
    }, 300);
  };

  if (!appkey) return <MissingKeyNotice />;
  if (error) return <LoaderErrorNotice error={error} />;
  if (loading) return <LoadingNotice />;

  return (
    <div className="relative h-full w-full">
      <KakaoMap
        center={SEOUL_CENTER}
        level={DEFAULT_LEVEL}
        style={{ width: '100%', height: '100%' }}
        aria-label="이벤트 지도"
        onClick={() => onSelectEvent?.(null)}
        onBoundsChanged={handleBoundsChanged}
        onCreate={(map) => { mapInstanceRef.current = map; }}
      >
        {highlightedGu.map((gu) => (
          <Polygon
            key={gu.name}
            path={gu.path}
            strokeWeight={3}
            strokeColor="#E8562D"
            strokeOpacity={strokeOpacity}
            strokeStyle="solid"
            fillColor="#E8562D"
            fillOpacity={fillOpacity}
          />
        ))}
        <MarkerClusterer
          averageCenter
          minLevel={5}
          disableClickZoom={false}
          gridSize={72}
          minClusterSize={3}
          calculator={CLUSTER_CALCULATOR}
          styles={CLUSTER_STYLES}
        >
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
          <CustomOverlayMap
            position={{ lat: selectedPin.lat, lng: selectedPin.lng }}
            yAnchor={1}
            xAnchor={0.5}
            zIndex={50}
          >
            <div aria-hidden className="pointer-events-none">
              <span
                className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-(--color-accent) shadow-(--shadow-pin) [animation:alle-pulse_1.8s_cubic-bezier(0,0,0.2,1)_infinite]"
              />
            </div>
          </CustomOverlayMap>
        )}
      </KakaoMap>
      <StatusBadge count={pins.length} error={fetchError} />
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
  // tone 은 tint 된 배경 + 전체 1px 경계로만 표현. 사이드 스트라이프 금지 (DESIGN.md §Component tokens,
  // impeccable <absolute_bans>).
  const toneClass =
    tone === 'warning'
      ? 'border-(--color-warning)/40 bg-(--color-warning)/10'
      : 'border-(--color-error)/40 bg-(--color-error)/10';
  return (
    <div className="flex h-full items-center justify-center bg-(--color-surface-alt) p-8">
      <div className={`max-w-md rounded-(--radius-lg) border p-6 shadow-(--shadow-md) ${toneClass}`}>
        {children}
      </div>
    </div>
  );
}
