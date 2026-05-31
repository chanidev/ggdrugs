-- Slice 5: MateEvaluation / FestivalSurvey / FestivalReview / CreditLedger
-- HUMAN GATE: 에이전트는 이 파일을 실행하지 않는다.
--             사람이 `prisma migrate deploy` 로 수동 적용할 것.
--
-- 설계 결정:
--   [이슈3] FestivalSurvey/FestivalReview UNIQUE = (appointment_id, user_id)
--           — 그룹 최대 4인 대비, appointmentId 단독 UNIQUE 아님.
--   [이슈4] festival_reviews.event_id — 이벤트 상세 연동 전제.
--   [이슈22] photo_urls CHECK ≤10장.

CREATE TABLE mate_evaluations (
  eval_id           BIGSERIAL PRIMARY KEY,
  appointment_id    BIGINT NOT NULL,
  evaluator_user_id BIGINT NOT NULL REFERENCES users(user_id),
  evaluated_user_id BIGINT NOT NULL REFERENCES users(user_id),
  rating_stars      SMALLINT NOT NULL CHECK (rating_stars BETWEEN 1 AND 5),
  q1                SMALLINT NOT NULL CHECK (q1 BETWEEN 1 AND 5),
  q2                SMALLINT NOT NULL CHECK (q2 BETWEEN 1 AND 5),
  q3                SMALLINT NOT NULL CHECK (q3 BETWEEN 1 AND 5),
  q4                SMALLINT NOT NULL CHECK (q4 BETWEEN 1 AND 5),
  comment           VARCHAR(30),
  reported_for      VARCHAR(20) CHECK (reported_for IN ('inappropriate','harassing','no_show','etc')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mate_eval_pair UNIQUE (appointment_id, evaluator_user_id, evaluated_user_id)
);
CREATE INDEX idx_mate_eval_evaluated ON mate_evaluations (evaluated_user_id, created_at DESC);

-- [이슈3] UNIQUE = (appointment_id, user_id)
CREATE TABLE festival_surveys (
  survey_id      BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES appointments(appointment_id),
  user_id        BIGINT NOT NULL REFERENCES users(user_id),
  atmosphere     SMALLINT NOT NULL CHECK (atmosphere BETWEEN 1 AND 5),
  program        SMALLINT NOT NULL CHECK (program BETWEEN 1 AND 5),
  food           SMALLINT NOT NULL CHECK (food BETWEEN 1 AND 5),
  safety         SMALLINT NOT NULL CHECK (safety BETWEEN 1 AND 5),
  transport      SMALLINT NOT NULL CHECK (transport BETWEEN 1 AND 5),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_festival_survey_pair UNIQUE (appointment_id, user_id)
);

-- [이슈3] UNIQUE = (appointment_id, user_id)
-- [이슈4] event_id — Appointment.eventId 복사 (NULL 허용하지만 라우트에서 NULL 시 400)
-- [이슈22] photo_urls CHECK ≤10장
CREATE TABLE festival_reviews (
  review_id      BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES appointments(appointment_id),
  user_id        BIGINT NOT NULL REFERENCES users(user_id),
  event_id       BIGINT,
  rating_stars   SMALLINT NOT NULL CHECK (rating_stars BETWEEN 1 AND 5),
  body           VARCHAR(5000) NOT NULL,
  photo_urls     TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_festival_review_pair UNIQUE (appointment_id, user_id),
  CONSTRAINT check_photo_urls_count
    CHECK (array_length(photo_urls, 1) IS NULL OR array_length(photo_urls, 1) <= 10)
);
CREATE INDEX idx_festival_review_event ON festival_reviews (event_id, created_at DESC);
CREATE INDEX idx_festival_review_user  ON festival_reviews (user_id, created_at DESC);
CREATE TRIGGER trg_festival_reviews_updated_at
  BEFORE UPDATE ON festival_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- action CHECK: appointment_complete = Slice 7+ placeholder (Slice 5 미구현)
CREATE TABLE credit_ledgers (
  ledger_id      BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(user_id),
  action         VARCHAR(30) NOT NULL
    CHECK (action IN ('appointment_complete','mate_eval_complete','review_complete')),
  points_amount  INT NOT NULL,
  appointment_id BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_credit_ledger_user ON credit_ledgers (user_id, created_at DESC);
