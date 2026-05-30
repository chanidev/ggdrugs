// apps/web/src/pages/EvaluationPage/parts/StarRating.tsx
interface StarRatingProps {
  value: number;     // 1~5, 0=미선택
  onChange: (v: number) => void;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, readOnly = false }: StarRatingProps) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          aria-label={`${star}점`}
          aria-pressed={value === star}
          onClick={() => !readOnly && onChange(star)}
          style={{
            fontSize: '28px',
            cursor: readOnly ? 'default' : 'pointer',
            background: 'none',
            border: 'none',
            padding: '0 2px',
            color: star <= value ? 'var(--color-brand, #0070f3)' : 'var(--color-border, #d1d5db)',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
