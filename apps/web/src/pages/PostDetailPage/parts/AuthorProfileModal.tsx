import { useEffect, useState } from 'react';
import { Avatar } from 'seed-design/ui/avatar';
import * as Dialog from 'seed-design/ui/dialog';
import { ActionButton } from 'seed-design/ui/action-button';
import { getMateIndex } from '../../../lib/api/mate.js';

/**
 * GG-POST-008/009: 작성자 프로필 모달.
 * - 닉네임 실데이터 표시.
 * - 메이트 지수: GET /community/mate/index/:userId 조회 후 실값 표시.
 *   indexValue null = 메이트 프로필 미등록.
 * - 채팅신청 — 슬라이스 5에서 실구현(현재 placeholder).
 */
export function AuthorProfileModal({
  nickname,
  authorUserId,
  onClose,
}: {
  nickname: string;
  authorUserId: string;
  onClose: () => void;
}) {
  // null = 아직 로딩 중, number = 조회된 지수, 'none' = 프로필 미등록
  const [mateIndex, setMateIndex] = useState<number | 'none' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMateIndex(authorUserId)
      .then((result) => {
        if (cancelled) return;
        if (result === null || result.indexValue === null) {
          setMateIndex('none');
        } else {
          setMateIndex(result.indexValue);
        }
      })
      .catch(() => {
        if (!cancelled) setMateIndex('none');
      });
    return () => { cancelled = true; };
  }, [authorUserId]);

  const mateIndexLabel =
    mateIndex === null
      ? '…'
      : mateIndex === 'none'
        ? '-'
        : String(mateIndex);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content className="w-[320px] max-w-[92vw]">
          <Dialog.Header>
            <div className="flex items-center gap-3">
              {/* SEED Avatar — 이니셜 fallback (프로필 이미지 없을 시) */}
              <Avatar
                fallback={nickname.slice(0, 1)}
                size="64"
                aria-label={`${nickname}의 프로필 아바타`}
              />
              <Dialog.Title>{nickname}</Dialog.Title>
            </div>
          </Dialog.Header>

          <div className="flex flex-col gap-3 px-5 pb-2">
            {/* GG-POST-009: 메이트 지수 실값 (Task 6 연결) */}
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-(--color-text-muted)">메이트 지수</span>
              <span
                className={
                  typeof mateIndex === 'number'
                    ? 'font-semibold text-(--color-text)'
                    : 'text-(--color-text-muted)'
                }
              >
                {mateIndexLabel}
              </span>
            </div>
          </div>

          <Dialog.Footer>
            <ActionButton
              variant="neutralOutline"
              size="medium"
              onClick={onClose}
            >
              닫기
            </ActionButton>
            {/* GG-POST-008: 채팅신청 — 슬라이스 5에서 실구현 */}
            <ActionButton
              variant="brandSolid"
              size="medium"
              disabled
              aria-label="채팅 신청하기 (준비 중)"
            >
              채팅 신청하기
            </ActionButton>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
