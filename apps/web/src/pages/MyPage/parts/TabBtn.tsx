export function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative -mb-px inline-flex h-10 items-center border-b-2 px-4 text-[14px] font-medium transition-colors ${
        active
          ? 'border-(--color-accent) text-(--color-accent)'
          : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'
      }`}
    >
      {children}
    </button>
  );
}
