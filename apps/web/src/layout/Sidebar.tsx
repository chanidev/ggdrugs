import { useState } from 'react';
import { FilterSearchPanel } from '../components/FilterSearchPanel';
import { FullListPanel } from '../components/FullListPanel';

/**
 * Sidebar — 메인 페이지 탐색 영역.
 *
 * Layout: 좁은 rail (3행 진입) + 오른쪽으로 펼쳐지는 확장 패널(세로 칼럼 하나 추가).
 * - rail 클릭 시 같은 섹션을 다시 누르면 닫힘 (toggle).
 * - 최대 1개 확장.
 * - 확장 시 map 영역이 줄어듦. 닫으면 rail만 차지.
 * - 채팅은 주 입력이 지도 하단 ChatDock이므로 확장 패널은 예시 힌트만.
 */

type Section = 'filter' | 'list' | 'chat';

const SECTIONS: Array<{
  key: Section;
  title: string;
  description: string;
}> = [
  {
    key: 'filter',
    title: '필터 검색',
    description: '지역·기간·인원구성·종류·성향',
  },
  {
    key: 'list',
    title: '전체목록 조회',
    description: '축제·박람회·심포지움·컨퍼런스',
  },
  {
    key: 'chat',
    title: '채팅방 검색',
    description: '자연어 질문',
  },
];

export function Sidebar() {
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (key: Section) =>
    setOpen((prev) => (prev === key ? null : key));

  const activeSection = open ? SECTIONS.find((s) => s.key === open) : null;

  return (
    <>
      {/* 좁은 rail */}
      <aside
        className="flex w-[220px] shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface)"
        aria-label="이벤트 탐색 메뉴"
      >
        <h2 className="shrink-0 px-4 py-5 text-h3 font-semibold tracking-tight">
          이벤트 찾기
        </h2>
        <nav aria-label="탐색 메뉴">
          <ul className="divide-y divide-(--color-border) border-y border-(--color-border)">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <RowButton
                  section={s}
                  active={open === s.key}
                  onClick={() => toggle(s.key)}
                />
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* 확장 패널 — rail 오른쪽 */}
      {open !== null && activeSection && (
        <section
          className="flex w-[360px] shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface)"
          aria-label={`${activeSection.title} 상세`}
        >
          <PanelHeader title={activeSection.title} onClose={() => setOpen(null)} />
          <div className="min-h-0 flex-1 overflow-hidden">
            {open === 'filter' && <FilterSearchPanel />}
            {open === 'list' && <FullListPanel />}
            {open === 'chat' && <ChatHelpPanel />}
          </div>
        </section>
      )}
    </>
  );
}

function RowButton({
  section,
  active,
  onClick,
}: {
  section: { key: Section; title: string; description: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 px-4 py-4 text-left transition-colors ${
        active
          ? 'bg-(--color-accent-bg)'
          : 'hover:bg-(--color-surface-alt)'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-(--color-accent)"
        />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`mb-0.5 text-body font-semibold tracking-tight ${
            active ? 'text-(--color-accent)' : 'text-(--color-text)'
          }`}
        >
          {section.title}
        </p>
        <p className="truncate text-body-sm text-(--color-text-muted)">
          {section.description}
        </p>
      </div>
      <span
        aria-hidden
        className={`shrink-0 text-body transition-colors ${
          active
            ? 'text-(--color-accent)'
            : 'text-(--color-text-subtle) group-hover:text-(--color-accent)'
        }`}
      >
        →
      </span>
    </button>
  );
}

function PanelHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-(--color-border) px-4">
      <h3 className="text-body font-semibold tracking-tight">{title}</h3>
      <button
        type="button"
        aria-label="패널 닫기"
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-(--radius-md) text-body text-(--color-text-muted) transition-colors hover:bg-(--color-surface-alt) hover:text-(--color-text)"
      >
        ×
      </button>
    </div>
  );
}

function ChatHelpPanel() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <p className="text-body-sm text-(--color-text-muted)">
        지도 하단 입력창에 자연어로 질문하면 LLM이 필터 조건을 맞춰 좁혀줍니다.
      </p>
      <div className="flex flex-col gap-2">
        <ExampleQuery>이번 주말 가족이랑 볼만한 축제</ExampleQuery>
        <ExampleQuery>강남에서 이번 달 AI 컨퍼런스</ExampleQuery>
        <ExampleQuery>혼자 가도 좋은 교육형 이벤트</ExampleQuery>
      </div>
    </div>
  );
}

function ExampleQuery({ children }: { children: string }) {
  return (
    <span className="inline-block rounded-full border border-(--color-border) bg-(--color-surface) px-3 py-1 text-body-sm text-(--color-text-muted)">
      "{children}"
    </span>
  );
}
