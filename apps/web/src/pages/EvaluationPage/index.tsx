// apps/web/src/pages/EvaluationPage/index.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../layout/Header.js';
import { MateEvalStep, type MateEvalData } from './parts/MateEvalStep.js';
import { FestivalStep, type FestivalData } from './parts/FestivalStep.js';
import { submitEvaluation, getMyEvaluation } from '../../lib/api/evaluation.js';
import { createReport, blockUser, type ReportReason } from '../../lib/api/reports.js';

type Step = 'loading' | 'mate' | 'festival' | 'done';

/**
 * EvaluationPage — A_900 + A_901 단일 진입점.
 * [오버라이드] 진입 경로: 커뮤니티 추천 영역 "평가하기" 버튼 + mate_eval 알림.
 * URL: /evaluate/:appointmentId?evaluatedUserId=<id>&chatRoomId=<id>
 * [이슈9] 마운트 시 getMyEvaluation 호출 → 이미 제출이면 즉시 'done' 화면.
 * [오버라이드] "다녀온 후" 게이트: BFF에서 appointedAt <= now() 검증.
 */
export function EvaluationPage() {
  const { t } = useTranslation('mypage');
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [searchParams] = useSearchParams();
  const evaluatedUserId = searchParams.get('evaluatedUserId') ?? '';
  const chatRoomId = searchParams.get('chatRoomId') ?? '';
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('loading');
  const [mateData, setMateData] = useState<MateEvalData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // [이슈9] 마운트 시 중복 제출 사전 차단
  useEffect(() => {
    if (!appointmentId) { setStep('mate'); return; }
    getMyEvaluation(appointmentId)
      .then((existing) => setStep(existing ? 'done' : 'mate'))
      .catch(() => setStep('mate')); // 조회 실패 시 폼 표시 (제출 시점에 409 처리)
  }, [appointmentId]);

  if (!appointmentId || !evaluatedUserId) {
    return (
      <div className="flex h-screen flex-col bg-(--color-bg)">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-(--color-danger)">{t('evaluation.invalidAccess')}</p>
        </main>
      </div>
    );
  }

  async function handleBlock() {
    // GG-REPORT-008: 일반 차단 API (chatRoomId 없는 surface용).
    // EvaluationPage 에서는 chatRoomId 컨텍스트 없이 평가 대상자를 차단하므로
    // lib/api/reports.ts blockUser() 를 사용한다 — raw fetch 대신 withCredentials 보장.
    try {
      await blockUser(evaluatedUserId);
      alert(t('evaluation.blockSuccess'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'ALREADY_BLOCKED' || msg === 'already_blocked') {
        alert(t('evaluation.alreadyBlocked'));
      } else if (msg === 'UNAUTHENTICATED') {
        alert(t('block.loginRequired'));
      } else {
        alert(t('block.error'));
      }
    }
  }

  // reportedFor → ReportReason 매핑 (MateEvalStep REPORT_OPTIONS 기준)
  const REPORTED_FOR_TO_REASON: Record<string, ReportReason> = {
    inappropriate: 'abuse',
    harassing: 'harassment',
    no_show: 'no_show',
    etc: 'etc',
  };

  async function handleFestivalSubmit(festivalData: FestivalData) {
    if (!mateData) return;
    setSubmitting(true);
    setError(null);
    try {
      const submitBody = {
        evaluatedUserId,
        ratingStars: mateData.ratingStars,
        q1: mateData.q1, q2: mateData.q2, q3: mateData.q3, q4: mateData.q4,
        reportedFor: mateData.reportedFor,
        atmosphere: festivalData.atmosphere,
        program: festivalData.program,
        food: festivalData.food,
        safety: festivalData.safety,
        transport: festivalData.transport,
        reviewRating: festivalData.reviewRating,
        reviewBody: festivalData.reviewBody,
        photoUrls: festivalData.photoUrls,
        ...(mateData.comment ? { comment: mateData.comment } : {}),
      };
      const evalResult = await submitEvaluation(appointmentId!, submitBody);

      // GG-REPORT-001 (mate_eval surface): 평가 제출 성공 후 reportedFor가 있으면
      // 자동으로 Report 생성 — ReportModal 팝업 없이 자동 처리.
      if (mateData.reportedFor && REPORTED_FOR_TO_REASON[mateData.reportedFor]) {
        try {
          await createReport({
            targetUserId: evaluatedUserId,
            targetType: 'mate_eval',
            targetEntityId: evalResult.evalId,
            reason: REPORTED_FOR_TO_REASON[mateData.reportedFor]!,
          });
        } catch (reportErr) {
          // 신고 실패는 평가 완료에 영향을 주지 않음 (사용자는 평가 완료로 인식).
          // [review: low] 최소 경고 로그 유지 — 모니터링 시 누락 신고 추적 가능.
          console.warn('[EvaluationPage] mate_eval createReport silent fail:', reportErr);
        }
      }

      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'ALREADY_SUBMITTED') {
        setError(t('evaluation.alreadyEvaluated'));
      } else if (msg === 'NOT_ATTENDED_YET') {
        setError(t('evaluation.notAfterDate'));
      } else if (msg === 'NOT_CONFIRMED') {
        setError(t('evaluation.notConfirmed'));
      } else {
        setError(t('evaluation.submitError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <Header />
      <main className="mx-auto w-full max-w-[480px] px-4 py-6">
        {step === 'loading' && (
          <p className="text-center text-[14px] text-(--color-text-muted)">{t('calendar.loadError')}</p>
        )}
        {step === 'mate' && (
          <MateEvalStep
            onNext={(data) => { setMateData(data); setStep('festival'); }}
            onBlock={handleBlock}
          />
        )}
        {step === 'festival' && (
          <FestivalStep
            onBack={() => setStep('mate')}
            onSubmit={handleFestivalSubmit}
            submitting={submitting}
          />
        )}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-[40px]">✓</p>
            <h2 className="text-(length:--text-h3) font-semibold">{t('evaluation.submitSuccess')}</h2>
            <p className="text-[14px] text-(--color-text-muted)">{t('evaluation.creditEarned')}</p>
            <button
              type="button"
              onClick={() => void navigate('/community')}
              className="mt-2 rounded-(--radius-md) bg-(--color-brand) px-6 py-2 text-[14px] font-medium text-white"
            >
              {t('evaluation.toCommunity')}
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-center text-[13px] text-(--color-danger)">{error}</p>}
      </main>
    </div>
  );
}
