import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from 'seed-design/ui/avatar';
import * as Dialog from 'seed-design/ui/dialog';
import { ActionButton } from 'seed-design/ui/action-button';
import { getMateIndex } from '../../../lib/api/mate.js';
import { blockUser } from '../../../lib/api/reports.js';

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
  const { t } = useTranslation('community');
  const navigate = useNavigate();
  // null = 아직 로딩 중, number = 조회된 지수, 'none' = 프로필 미등록
  const [mateIndex, setMateIndex] = useState<number | 'none' | null>(null);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

  const handleBlock = async () => {
    if (!confirm(`${nickname}님을 차단하시겠어요?`)) return;
    setBlocking(true);
    setBlockMsg(null);
    try {
      await blockUser(authorUserId);
      setBlockMsg('차단되었습니다.');
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'already_blocked' || msg === 'ALREADY_BLOCKED') {
        setBlockMsg('이미 차단된 사용자입니다.');
      } else {
        setBlockMsg('차단하지 못했어요.');
      }
    } finally {
      setBlocking(false);
    }
  };

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
              <span className="text-(--color-text-muted)">{t('authorModal.mateScore')}</span>
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
            {/* GG-REPORT-008: 차단 피드백 메시지 */}
            {blockMsg && (
              <p className="text-[12px] text-(--color-text-muted)">{blockMsg}</p>
            )}
          </div>

          <Dialog.Footer>
            <ActionButton
              variant="neutralOutline"
              size="medium"
              onClick={onClose}
            >
              {t('authorModal.close')}
            </ActionButton>
            {/* GG-REPORT-008: 일반 차단 (POST /community/users/:id/block) */}
            <ActionButton
              variant="neutralOutline"
              size="medium"
              onClick={() => { void handleBlock(); }}
              disabled={blocking}
              aria-label={`${nickname} 차단하기`}
            >
              차단하기
            </ActionButton>
            {/* GG-POST-008: 채팅신청 — 슬라이스3 실구현 */}
            <ActionButton
              variant="brandSolid"
              size="medium"
              onClick={() => {
                onClose();
                void navigate(
                  `/chat/request?to=${encodeURIComponent(authorUserId)}&nickname=${encodeURIComponent(nickname)}`,
                );
              }}
              aria-label={`${nickname}에게 채팅 신청하기`}
            >
              {t('authorModal.chatRequest')}
            </ActionButton>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
