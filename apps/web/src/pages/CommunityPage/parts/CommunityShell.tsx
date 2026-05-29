import type { PostCategory } from '../../../lib/api/posts.js';

/** GG-POST-004: 카테고리 레이블 — ComposeModal, PostListPage, CategoryGrid 등에서 참조 */
export const CATEGORY_LABELS: Record<PostCategory, string> = {
  festival_story: '축제 이야기',
  mate_finder: '메이트 구해요',
  free: '자유 게시판',
};

// Task 6 에서 CommunityShell 전체 구현 추가 예정.
// 현재는 ComposeModal 의 CATEGORY_LABELS import 의존을 충족하는 최소 stub.
