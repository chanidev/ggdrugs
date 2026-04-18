import { CHAT_EXAMPLES } from '../data/mock';

/**
 * ChatHelpPanel — 채팅 섹션의 설명 + 예시 쿼리 리스트.
 * 예시 클릭 → 오버레이 닫고 하단 ChatDock 입력창에 쿼리 세팅 (onPick).
 */
export function ChatHelpPanel({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-(--color-border) bg-(--color-surface-warm) px-5 py-5">
        <h3 className="m-0 mb-1.5 text-[17px] font-semibold tracking-[-0.01em]">
          자연어로 물어보세요
        </h3>
        <p className="m-0 text-[13px] leading-[1.55] text-(--color-text-muted)">
          하단 입력창에 일상 언어로 질문하면, LLM이 5개 필터(지역·기간·인원구성·종류·성향)를
          자동으로 매핑해서 좁혀 드립니다.
        </p>
      </div>
      <div className="flex flex-col gap-2 px-5 py-4">
        {CHAT_EXAMPLES.map((ex) => (
          <button
            key={ex.q}
            type="button"
            onClick={() => onPick(ex.q)}
            className="group cursor-pointer rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3.5 text-left leading-[1.45] transition-colors hover:border-(--color-accent) hover:bg-(--color-accent-bg) hover:text-(--color-accent)"
          >
            <span className="block text-[14px] font-medium text-(--color-text) group-hover:text-(--color-accent)">
              "{ex.q}"
            </span>
            <span className="mt-[3px] block font-mono text-[11px] tracking-[0.02em] text-(--color-text-subtle) group-hover:text-(--color-accent)">
              → {ex.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
