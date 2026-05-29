import { ActionButton } from 'seed-design/ui/action-button';

/**
 * MateRecoPlaceholder — GG-COMM-006 우측 레일 메이트 추천 영역.
 *
 * GG-COMM-007/008 후속 이관:
 *   - 정보 미입력 = 블라인드 목록 + 유도 UI (슬라이스 3)
 *   - 입력 완료 = 프로필 목록 (슬라이스 4)
 */
export function MateRecoPlaceholder() {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <h2 className="mb-2 text-[15px] font-semibold">메이트 추천</h2>
      {/* GG-COMM-007/008 후속 이관: 정보 미입력=블라인드 목록+유도, 입력완료=프로필 목록 (슬라이스 3~4) */}
      <p className="mb-3 text-[13px] text-(--color-text-muted)">
        메이트 매칭 정보를 입력하면 추천 목록이 노출돼요. (준비 중)
      </p>
      <ActionButton
        variant="neutralOutline"
        size="small"
        disabled
        className="w-full"
      >
        메이트 추천 받기
      </ActionButton>
    </div>
  );
}
