export function EmptyBox({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface-alt) p-10 text-center">
      <p className="m-0 mb-1 text-[15px] font-semibold text-(--color-text)">{label}</p>
      <p className="m-0 text-[13px] text-(--color-text-muted)">{hint}</p>
    </div>
  );
}
