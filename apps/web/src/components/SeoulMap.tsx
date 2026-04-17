import { useMemo } from 'react';
import { Map, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk';

/**
 * SeoulMap — Kakao Maps 기반 서울 이벤트 지도.
 *
 * Env: VITE_KAKAO_MAP_JS_KEY (공개 JavaScript 키).
 *
 * DESIGN.md:
 * - 지도는 main 영역 전체를 채움 (배경 레이어).
 * - 핀은 --color-accent 버밀리언 + --shadow-pin.
 * - 클러스터 분해 애니메이션은 signature moment (TODO: Phase 2, 카카오 클러스터러 활용).
 */

// 서울 시청 좌표를 디폴트 중심으로
const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const DEFAULT_LEVEL = 8; // 1(가장 확대) ~ 14(가장 축소). 서울 전역이 보이는 레벨.

// 더미 핀 — 실제로는 /events API에서 받아옴
const DUMMY_PINS = [
  { id: 1, lat: 37.575, lng: 126.9768, title: '서울 빛초롱 축제 2026' },
  { id: 2, lat: 37.5172, lng: 127.0473, title: '코리아 콘텐츠 박람회' },
  { id: 3, lat: 37.4785, lng: 126.9515, title: 'AI 윤리 심포지움' },
];

export function SeoulMap() {
  const appkey = import.meta.env.VITE_KAKAO_MAP_JS_KEY as string | undefined;

  const [loading, error] = useKakaoLoader({
    appkey: appkey ?? '',
    libraries: ['services', 'clusterer'],
  });

  const markers = useMemo(() => DUMMY_PINS, []);

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
      >
        {markers.map((m) => (
          <MapMarker
            key={m.id}
            position={{ lat: m.lat, lng: m.lng }}
            title={m.title}
          />
        ))}
      </Map>
    </div>
  );
}

function MissingKeyNotice() {
  return (
    <NoticeBox tone="warning">
      <p className="font-semibold">Kakao Maps 키 없음</p>
      <p className="text-body-sm text-(--color-text-muted)">
        <code className="rounded-sm bg-(--color-surface) px-1 py-0.5">
          .env
        </code>{' '}
        파일에{' '}
        <code className="rounded-sm bg-(--color-surface) px-1 py-0.5">
          VITE_KAKAO_MAP_JS_KEY
        </code>
        를 설정하고 dev 서버 재시작.
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
    msg = scriptSrc
      ? `스크립트 로드 실패: ${scriptSrc}`
      : '스크립트 로드 실패 (event target 없음)';
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
        <li>
          Kakao 개발자 콘솔의 앱이 <b>JavaScript 키</b>인지 확인 (REST API 키 X)
        </li>
        <li>
          허용 도메인에 <code>http://localhost:5173</code> 등록 확인
        </li>
        <li>브라우저 F12 → Network 탭에서 sdk.js 요청 status 확인</li>
        <li>광고 차단기 / 확장프로그램 차단 여부 확인</li>
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

function NoticeBox({
  tone,
  children,
}: {
  tone: 'warning' | 'error';
  children: React.ReactNode;
}) {
  const bg =
    tone === 'warning'
      ? 'bg-(--color-warning)/10 border-(--color-warning)'
      : 'bg-(--color-error)/10 border-(--color-error)';
  return (
    <div className="flex h-full items-center justify-center bg-(--color-surface-alt) p-8">
      <div
        className={`max-w-md rounded-(--radius-lg) border-l-4 bg-(--color-surface) p-6 shadow-(--shadow-md) ${bg}`}
      >
        {children}
      </div>
    </div>
  );
}
