/**
 * MapPlaceholder — Kakao Maps 붙을 자리. API 키 확보 후 교체.
 * DESIGN.md §Layout: 지도는 main의 최상단, 배경이 되는 레이어.
 */
export function MapPlaceholder() {
  return (
    <div
      className="relative flex-1 overflow-hidden bg-(--color-surface-alt)"
      aria-label="지도 자리 (Kakao Maps 연동 예정)"
    >
      {/* 격자 배경 — 지도 느낌 placeholder */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* 가짜 클러스터 핀 3개 — 디자인 시스템 핀 토큰 검증 */}
      <FakePin top="28%" left="42%" count={12} />
      <FakePin top="54%" left="60%" count={4} />
      <FakePin top="68%" left="28%" count={7} />

      <div className="absolute right-6 top-6 rounded-(--radius-md) bg-(--color-surface) px-3 py-2 text-body-sm text-(--color-text-muted) shadow-(--shadow-md)">
        지도 영역 — Kakao Maps 예정
      </div>
    </div>
  );
}

function FakePin({
  top,
  left,
  count,
}: {
  top: string;
  left: string;
  count: number;
}) {
  return (
    <div
      className="absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-(--color-accent) text-body-sm font-semibold text-white shadow-(--shadow-pin) transition-transform hover:scale-110"
      style={{ top, left }}
    >
      {count}
    </div>
  );
}
