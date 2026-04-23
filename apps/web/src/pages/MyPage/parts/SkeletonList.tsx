export function SkeletonList() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="h-[90px] animate-pulse rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-alt)"
        />
      ))}
    </div>
  );
}
