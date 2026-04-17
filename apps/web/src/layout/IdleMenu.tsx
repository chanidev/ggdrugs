import { useNavigate } from 'react-router';

/**
 * IdleMenu — '/' 라우트. 사이드바 메인 메뉴.
 *
 * DESIGN.md §Layout/Shadow: 카드 스택이 아닌 테이블 행 나열.
 * divide-y 만으로 구분, border-radius/shadow 없음.
 */
const ROUTES = [
  {
    to: '/filter',
    title: '필터 검색',
    description: '지역·기간·인원구성·종류·성향 5가지 조건을 조합해 좁혀 찾기.',
  },
  {
    to: '/list',
    title: '전체목록 조회',
    description: '축제·박람회·심포지움·컨퍼런스 4가지 카테고리로 전체를 훑어보기.',
  },
  {
    to: '/chat',
    title: '채팅방 검색',
    description: '"이번 주말 가족이랑 볼만한 축제" 같이 자연어로 질문.',
  },
] as const;

export function IdleMenu() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <h2 className="shrink-0 px-4 py-5 text-h3 font-semibold tracking-tight">
        이벤트 찾기
      </h2>
      <nav aria-label="탐색 메뉴">
        <ul className="divide-y divide-(--color-border) border-y border-(--color-border)">
          {ROUTES.map((r) => (
            <li key={r.to}>
              <button
                type="button"
                onClick={() => navigate(r.to)}
                className="group flex w-full items-center gap-4 px-4 py-5 text-left transition-colors hover:bg-(--color-surface-alt)"
              >
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-body font-semibold tracking-tight text-(--color-text)">
                    {r.title}
                  </p>
                  <p className="text-body-sm text-(--color-text-muted)">
                    {r.description}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="shrink-0 text-body text-(--color-text-subtle) transition-colors group-hover:text-(--color-accent)"
                >
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-auto px-4 py-4 text-caption text-(--color-text-subtle)">
        지도 위 핀을 바로 클릭해도 돼요.
      </p>
    </div>
  );
}
