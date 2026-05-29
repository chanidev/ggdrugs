import { Link } from 'react-router';
import { ActionButton } from 'seed-design/ui/action-button';

/**
 * MateRecoPlaceholder — GG-COMM-006 우측 레일 메이트 추천 영역.
 *
 * Task 4: /mate/form 실링크 연결 (GG-COMM-007/008 블라인드→입력유도).
 * Task 5: 추천 목록 실구현 예정 (MateRecommendationsPage).
 */
export function MateRecoPlaceholder() {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <h2 className="mb-2 text-[15px] font-semibold">메이트 추천</h2>
      {/* GG-COMM-007/008: 정보 미입력=블라인드 목록+유도 UI (슬라이스 5에서 실구현) */}
      <p className="mb-3 text-[13px] text-(--color-text-muted)">
        메이트 매칭 정보를 입력하면 추천 목록이 노출돼요.
      </p>
      <ActionButton
        variant="neutralOutline"
        size="small"
        asChild
        className="w-full"
      >
        <Link to="/mate/form">메이트 추천 받기</Link>
      </ActionButton>
    </div>
  );
}
