import { Link } from 'react-router';
import { ActionButton } from 'seed-design/ui/action-button';

/**
 * MateRecoPlaceholder — GG-COMM-006 우측 레일 메이트 추천 영역.
 *
 * Task 4: /mate/form 실링크 연결 (GG-COMM-007/008 블라인드→입력유도).
 * Task 5: /mate/recommendations 실링크 연결 (MateRecommendationsPage).
 */
export function MateRecoPlaceholder() {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <h2 className="mb-2 text-[15px] font-semibold">메이트 추천</h2>
      {/* GG-COMM-007/008: 정보 미입력 = 블라인드 + 입력 유도. MateRecommendationsPage가 상태 분기 담당. */}
      <p className="mb-3 text-[13px] text-(--color-text-muted)">
        매칭 조건에 맞는 메이트를 추천해 드려요.
      </p>
      <div className="flex flex-col gap-2">
        <ActionButton
          variant="brandSolid"
          size="small"
          asChild
          className="w-full"
        >
          <Link to="/mate/recommendations">추천 목록 보기</Link>
        </ActionButton>
        <ActionButton
          variant="neutralOutline"
          size="small"
          asChild
          className="w-full"
        >
          <Link to="/mate/form">조건 입력 · 수정</Link>
        </ActionButton>
      </div>
    </div>
  );
}
