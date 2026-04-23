-- ADR 0004 §결정 D-6: admin 측 보안·운영 액션 감사용 범용 테이블.
-- 첫 사용처는 POST /admin/users/:id/revoke-sessions. 향후 admin user 관리 ADR (D-1)
-- 에서 user soft-delete / 권한 변경 등도 같은 테이블에 기록.
--
-- target_id 가 nullable + payload JSONB 라 action 종류에 무관하게 같은 스키마 사용.
-- action 에 CHECK 제약은 두지 않음 — 새 action 추가 시 마이그레이션 비용 회피.
-- approval_logs 와 분리한 이유는 그 테이블이 event_id NOT NULL FK 라 user/세션 액션을 못 담음.

CREATE TABLE admin_audit_logs (
  audit_id   BIGSERIAL    PRIMARY KEY,
  admin_id   BIGINT       NOT NULL REFERENCES users(user_id),
  action     VARCHAR(50)  NOT NULL,
  target_id  BIGINT,
  payload    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_audit_action_created ON admin_audit_logs(action, created_at DESC);
CREATE INDEX idx_admin_audit_admin_created  ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_admin_audit_target         ON admin_audit_logs(target_id) WHERE target_id IS NOT NULL;
