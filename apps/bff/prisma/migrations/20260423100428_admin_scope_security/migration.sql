-- ADR 0005 §결정 E-3: admin scope 도메인에 'security' 추가.
-- ADR 0004 §결정 D-6 (revoke-sessions) 의 통과 권한 표현용.
-- 기존 chk_admin_scope 는 ADR 0001 #3 에서 신설된 후 본 마이그레이션이 첫 갱신.

ALTER TABLE admin_profiles
    DROP CONSTRAINT chk_admin_scope;

ALTER TABLE admin_profiles
    ADD CONSTRAINT chk_admin_scope
        CHECK (scope IN ('full','content_only','uploader_review_only','security'));
