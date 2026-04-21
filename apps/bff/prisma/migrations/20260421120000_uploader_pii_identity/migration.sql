-- ADR 0003 — 업로더 PII 정책 적용.
-- 주민번호 저장 금지 (§24-2). 기관=사업자등록번호, 개인=본인인증 CI 해시.
-- 둘 중 정확히 하나만 채움 (XOR). real_name 은 실명으로 저장 허용.

ALTER TABLE "uploader_profiles"
  ADD COLUMN "real_name"                    VARCHAR(50)  NOT NULL DEFAULT '',
  ADD COLUMN "business_registration_number" CHAR(10),
  ADD COLUMN "ci_hash"                      CHAR(88);

-- 기존 행(dev 테스트용)은 DEFAULT '' 로 real_name 채워짐. 신규 apply 부터 필수.

ALTER TABLE "uploader_profiles"
  ADD CONSTRAINT "chk_uploader_identity" CHECK (
    (business_registration_number IS NOT NULL AND ci_hash IS NULL) OR
    (business_registration_number IS NULL AND ci_hash IS NOT NULL) OR
    -- 기존 dev 행은 둘 다 NULL 허용 (이행 기간). 프로덕션 apply 엔드포인트에서 강제.
    (business_registration_number IS NULL AND ci_hash IS NULL)
  ),
  ADD CONSTRAINT "chk_biz_reg_number_format" CHECK (
    business_registration_number IS NULL OR business_registration_number ~ '^[0-9]{10}$'
  ),
  ADD CONSTRAINT "chk_ci_hash_length" CHECK (
    ci_hash IS NULL OR LENGTH(TRIM(ci_hash)) = 88
  ),
  ADD CONSTRAINT "uq_uploader_biz_reg_number" UNIQUE (business_registration_number),
  ADD CONSTRAINT "uq_uploader_ci_hash" UNIQUE (ci_hash);

-- 승급 서류 (A_600). event 심사용 approval_documents 와 분리.
CREATE TABLE "uploader_documents" (
  "document_id"       BIGSERIAL PRIMARY KEY,
  "uploader_id"       BIGINT       NOT NULL,
  "file_path"         VARCHAR(500) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "mime_type"         VARCHAR(30)  NOT NULL,
  "file_size_bytes"   INTEGER      NOT NULL,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chk_uploader_doc_mime" CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  CONSTRAINT "chk_uploader_doc_size" CHECK (file_size_bytes > 0 AND file_size_bytes <= 5242880),
  CONSTRAINT "uploader_documents_uploader_id_fkey"
    FOREIGN KEY ("uploader_id") REFERENCES "uploader_profiles"("uploader_id") ON DELETE CASCADE
);
CREATE INDEX "idx_uploader_docs_uploader" ON "uploader_documents"("uploader_id");
