import { useState } from 'react';
import { FilterSearchPanel } from '../components/FilterSearchPanel';
import { FullListPanel } from '../components/FullListPanel';

/**
 * Sidebar — 메인 페이지 사이드바. 확장 패널(accordion) 구조.
 *
 * - 3행(필터/전체목록/채팅) 중 최대 1개만 열림.
 * - 열린 행은 sidebar 내 남은 공간을 전부 채우고 스크롤.
 * - 닫힌 행은 헤더(제목+설명+arrow)만 보임.
 * - 라벨만 누르면 열리고, 다시 누르면 닫힘.
 *
 * Note: 채팅은 지도 하단 ChatDock 이 주 입력 수단이라, 이 행 확장은 간단한 안내만.
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
    description: '지역·기간·인원구성·종류·성향 5가지 조합.',
  },
  {
    key: 'list',
    title: '전체목록 조회',
    description: '축제·박람회·심포지움·컨퍼런스 카테고리로 훑기.',
  },
  {
    key: 'chat',
    title: '채팅방 검색',
    description: '자연어 질문 — 지도 하단 입력창에서 바로.',
  },
];

export function Sidebar() {
  const [open, setOpen] = useState<Section | null>(null);

  const toggle = (key: Section) =>
    setOpen((prev) => (prev === key ? null : key));

  return (
    <div className="flex h-full flex-col">
      <h2 className="shrink-0 px-4 py-5 text-h3 font-semibold tracking-tight">
        이벤트 찾기
      </h2>
      <div className="flex min-h-0 flex-1 flex-col border-t border-(--color-border)">
        {SECTIONS.map((s) => {
          const isOpen = open === s.key;
          return (
            <div
              key={s.key}
              className={`flex flex-col border-b border-(--color-border) ${
                isOpen ? 'min-h-0 flex-1' : 'shrink-0'
              }`}
            >
              <RowHeader section={s} open={isOpen} onToggle={() => toggle(s.key)} />
              {isOpen && (
                <div className="min-h-0 flex-1 overflow-hidden">
                  {s.key === 'filter' && <FilterSearchPanel />}
                  {s.key === 'list' && <FullListPanel />}
                  {s.key === 'chat' && <ChatHelpPanel />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowHeader({
  section,
  open,
  onToggle,
}: {
  section: { key: Section; title: string; description: string };
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-(--color-surface-alt)"
    >
      <div className="min-w-0 flex-1">
        <p
          className={`mb-0.5 text-body font-semibold tracking-tight ${
            open ? 'text-(--color-accent)' : 'text-(--color-text)'
          }`}
        >
          {section.title}
        </p>
        <p className="text-body-sm text-(--color-text-muted)">
          {section.description}
        </p>
      </div>
      <span
        aria-hidden
        className={`shrink-0 text-body transition-transform ${
          open
            ? 'rotate-180 text-(--color-accent)'
            : 'text-(--color-text-subtle) group-hover:text-(--color-accent)'
        }`}
      >
        ⌄
      </span>
    </button>
  );
}

function ChatHelpPanel() {
  return (
    <div className="flex h-full flex-col items-start gap-3 p-4">
      <p className="text-body-sm text-(--color-text-muted)">
        지도 하단 입력창에 자연어로 질문을 적으면 LLM이 필터 조건을 맞춰 좁혀줍니다.
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
