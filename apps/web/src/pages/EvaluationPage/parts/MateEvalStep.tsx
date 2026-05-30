// apps/web/src/pages/EvaluationPage/parts/MateEvalStep.tsx
import { useState } from 'react';
import { ActionButton } from 'seed-design/ui/action-button';
import { SegmentedControl, SegmentedControlItem } from 'seed-design/ui/segmented-control';
import { StarRating } from './StarRating.js';

export interface MateEvalData {
  ratingStars: number;
  q1: number; q2: number; q3: number; q4: number;
  comment: string;
  reportedFor: string | null;
}

interface Props {
  onNext: (data: MateEvalData) => void;
  onBlock: () => void;
}

const Q_LABELS = ['시간 약속', '의사소통', '분위기/유쾌함', '재방문 의향'] as const;
const REPORT_OPTIONS = [
  { value: 'inappropriate', label: '부적절한 언행' },
  { value: 'harassing',     label: '괴롭힘/폭력' },
  { value: 'no_show',       label: '노쇼' },
  { value: 'etc',           label: '기타' },
] as const;

export function MateEvalStep({ onNext, onBlock }: Props) {
  const [stars, setStars] = useState(0);
  const [qs, setQs] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [comment, setComment] = useState('');
  const [reportedFor, setReportedFor] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  function setQ(i: 0 | 1 | 2 | 3, v: number) {
    const next: [number, number, number, number] = [...qs] as [number, number, number, number];
    next[i] = v;
    setQs(next);
  }

  function handleCommentChange(v: string) {
    setComment(v);
    setCommentError(
      new TextEncoder().encode(v).length > 30 ? '한줄평은 최대 30바이트입니다.' : null,
    );
  }

  const canNext = stars > 0 && qs.every((q) => q > 0) && !commentError;

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-(length:--text-h3) font-semibold">메이트 평가</h2>

      <section>
        <p className="mb-2 text-[13px] text-(--color-text-muted)">전체 만족도</p>
        <StarRating value={stars} onChange={setStars} />
      </section>

      {Q_LABELS.map((label, i) => {
        const qVal = qs[i];
        const segProps = qVal === 0
          ? { 'aria-label': label, onValueChange: (v: string) => setQ(i as 0 | 1 | 2 | 3, Number(v)) }
          : { 'aria-label': label, value: String(qVal), onValueChange: (v: string) => setQ(i as 0 | 1 | 2 | 3, Number(v)) };
        return (
          <section key={label}>
            <p className="mb-1 text-[13px] font-medium">{label}</p>
            <SegmentedControl {...segProps}>
              {[1, 2, 3, 4, 5].map((v) => (
                <SegmentedControlItem key={v} value={String(v)}>{v}</SegmentedControlItem>
              ))}
            </SegmentedControl>
          </section>
        );
      })}

      <section>
        <label className="mb-1 block text-[13px] font-medium" htmlFor="comment">
          한줄평 <span className="text-(--color-text-muted)">(선택, 최대 30바이트)</span>
        </label>
        <input
          id="comment"
          type="text"
          value={comment}
          onChange={(e) => handleCommentChange(e.target.value)}
          placeholder="짧게 한 마디"
          className="w-full rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[14px] focus:outline-none focus:border-(--color-brand)"
        />
        {commentError && <p className="mt-1 text-[12px] text-(--color-danger)">{commentError}</p>}
      </section>

      <section>
        <p className="mb-1 text-[13px] font-medium">신고 사유 <span className="text-(--color-text-muted)">(선택)</span></p>
        <div className="flex flex-wrap gap-2">
          {REPORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setReportedFor(reportedFor === o.value ? null : o.value)}
              className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                reportedFor === o.value
                  ? 'border-(--color-brand) bg-(--color-brand) text-white'
                  : 'border-(--color-border) text-(--color-text-muted)'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex gap-2">
        <ActionButton variant="criticalSolid" size="small" onClick={onBlock}>
          차단
        </ActionButton>
        <ActionButton
          variant="brandSolid"
          size="medium"
          disabled={!canNext}
          onClick={() =>
            canNext &&
            onNext({ ratingStars: stars, q1: qs[0]!, q2: qs[1]!, q3: qs[2]!, q4: qs[3]!, comment, reportedFor })
          }
          className="flex-1"
        >
          다음 — 축제 후기 작성
        </ActionButton>
      </div>
    </div>
  );
}
