import { Avatar } from 'seed-design/ui/avatar';
import * as Dialog from 'seed-design/ui/dialog';
import { ActionButton } from 'seed-design/ui/action-button';

/**
 * GG-POST-008/009: 작성자 프로필 모달.
 * - 닉네임 실데이터 표시.
 * - 메이트 지수 / 채팅신청 — 슬라이스 4/5에서 실구현(현재 placeholder).
 */
export function AuthorProfileModal({
  nickname,
  onClose,
}: {
  nickname: string;
  onClose: () => void;
}) {
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
            {/* GG-POST-009: 메이트 지수 placeholder — 슬라이스 4에서 실구현 */}
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-(--color-text-muted)">메이트 지수</span>
              <span className="text-(--color-text-muted)">준비 중</span>
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
