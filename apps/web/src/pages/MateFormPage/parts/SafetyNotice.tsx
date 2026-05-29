/**
 * SafetyNotice — GG-MATCH-008 안전 가이드라인 블록.
 *
 * 메이트 추천 받기 폼 하단에 노출.
 * PII 제공 전 사용자에게 안전 수칙을 명시적으로 안내한다.
 */
export function SafetyNotice() {
  return (
    <div
      role="note"
      aria-label="안전 가이드라인"
      className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-alt) p-4 text-[13px] text-(--color-text-muted)"
    >
      <p className="mb-2 font-semibold text-(--color-text)">안전 가이드라인</p>
      <ul className="list-disc space-y-1 pl-4">
        <li>낯선 메이트와의 첫 만남은 공개 장소에서 진행하세요.</li>
        <li>개인 연락처는 신뢰가 쌓인 후 공유하세요.</li>
        <li>불쾌한 상황이 발생하면 즉시 신고 기능을 이용하세요.</li>
        <li>가치관·여행 스타일이 비슷한 메이트를 선택하면 더 좋은 경험이 됩니다.</li>
      </ul>
    </div>
  );
}
