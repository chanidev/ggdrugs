import { useTranslation } from 'react-i18next';
import type { PostCategory } from '../../../lib/api/posts.js';
import {
  SegmentedControl,
  SegmentedControlItem,
} from 'seed-design/ui/segmented-control';

export type CategoryFilter = 'all' | PostCategory;

/**
 * CategoryGrid — GG-COMM-003 카테고리 탭.
 * SEED SegmentedControl 사용 (anti-bubbly: 과한 라운드 지양, accent=버밀리언은 활성에만).
 */
export function CategoryGrid({
  active,
  onSelect,
}: {
  active: CategoryFilter;
  onSelect: (c: CategoryFilter) => void;
}) {
  const { t } = useTranslation('community');

  const ITEMS: Array<{ key: CategoryFilter; label: string }> = [
    { key: 'all',            label: t('category.all') },
    { key: 'festival_story', label: t('category.festival_story') },
    { key: 'mate_finder',    label: t('category.mate_finder') },
    { key: 'free',           label: t('category.free') },
  ];

  return (
    <div className="mb-4">
      <SegmentedControl
        aria-label="게시판 카테고리"
        value={active}
        onValueChange={(v) => onSelect(v as CategoryFilter)}
      >
        {ITEMS.map((it) => (
          <SegmentedControlItem key={it.key} value={it.key}>
            {it.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}
