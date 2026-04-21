# ADR 0003 — 업로더 PII 저장 정책 (주민번호 제거)

**Status**: Accepted
**Date**: 2026-04-21
**Context**: 요구사항 v5.0 A_600 "이름·주민등록번호·소속·연락처·증명사진"

## 문제

v5.0 요구사항이 업로더 승급 신청 필드로 **주민등록번호**를 명시. 하지만:

1. **개인정보보호법 §24-2**: "주민등록번호는 법령에 구체적 근거가 있는 경우 외에는 처리 불가". GGdrugs/Alle 는 법정 주민번호 처리 사업자가 아님 → **저장 자체가 위법 소지**.
2. **주민번호 유출 리스크**: DB 암호화해도 관리자 열람 경로가 열리면 유출 시 피해가 크다.
3. **실무 표준**: 본인인증은 외부 KYC (PASS / NICE / 카카오인증) 로 위임 후 **CI (Connecting Information, 88바이트 Base64)** 만 받는다. CI 는 개인 식별 불가하고 중복 체크만 가능.

## 결정

요구사항 v5.0 을 개정하고(ADR 0001 대칭 적용 패턴) 주민번호 요구를 제거한다. 업로더 신원 확인은 2 경로로 분기:

- **기관 업로더** (축제 기획사, 단체, 공공기관): `business_registration_number` (사업자등록번호 10자리)
- **개인 업로더**: `ci_hash` (외부 본인인증 CI 88자 Base64)

둘 중 **정확히 하나** 저장. 주민번호는 어떤 경로로도 DB 에 들어가지 않는다.

## 스키마 변경 (마이그레이션 20260421120000)

### `uploader_profiles` 확장

```sql
ALTER TABLE uploader_profiles
  ADD COLUMN real_name                    VARCHAR(50)  NOT NULL DEFAULT '',
  ADD COLUMN business_registration_number CHAR(10),
  ADD COLUMN ci_hash                      CHAR(88),
  ADD CONSTRAINT chk_uploader_identity CHECK (
    (business_registration_number IS NOT NULL AND ci_hash IS NULL) OR
    (business_registration_number IS NULL AND ci_hash IS NOT NULL)
  ),
  ADD CONSTRAINT chk_biz_reg_number_format CHECK (
    business_registration_number IS NULL OR business_registration_number ~ '^[0-9]{10}$'
  ),
  ADD CONSTRAINT uq_biz_reg_number UNIQUE (business_registration_number),
  ADD CONSTRAINT uq_ci_hash UNIQUE (ci_hash);
```

- `real_name` — 실명. 마스킹 대상 PII 지만 허용 범주 (개인정보보호법 일반 개인정보).
- `business_registration_number` — 기관 인증. 정규식은 10자리 숫자 포맷만 검증(실제 유효성은 외부 국세청 API 호출 후속 과제).
- `ci_hash` — CI 원본. 외부 KYC 에서 받은 값을 그대로 저장. 88 Base64 길이 보장.
- UNIQUE: 같은 사업자/개인이 여러 uploader_profile 못 만들게.
- CHECK: 정확히 하나만 채워짐을 강제 (XOR 조건).

### `uploader_documents` 신규 테이블

```sql
CREATE TABLE uploader_documents (
  document_id       BIGSERIAL PRIMARY KEY,
  uploader_id       BIGINT NOT NULL REFERENCES uploader_profiles(uploader_id) ON DELETE CASCADE,
  file_path         VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(30)  NOT NULL,
  file_size_bytes   INTEGER      NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_uploader_doc_mime CHECK (mime_type IN ('image/jpeg','image/png','application/pdf'))
);
CREATE INDEX idx_uploader_docs_uploader ON uploader_documents(uploader_id);
```

- event 심사용 `approval_documents` 와 분리. 승급 서류는 이벤트와 무관.
- 같은 S3 `ggdrugs-approval-docs` 버킷 사용, key prefix 로 분리: `uploader-doc/{uploaderId}/...`

## 보안 규칙

- `real_name`, `business_registration_number`, `ci_hash` 는 **절대 로그/에러 메시지에 출력 금지** (CLAUDE.md §6-3 강화).
- 관리자 조회 API (`GET /admin/uploaders/:id`) 는 `scope='full'` admin 만 접근. 하위 scope 는 실명·식별자 마스킹 (`홍**`, `***-**-*****`).
- 업로더 본인 `/me/uploader` 응답은 자기 실명만 반환, 식별자는 마지막 4자리 마스킹.
- 승인 완료 후 `real_name` 변경은 관리자 경유만 (자기 변경 불가 — 위장 방지).

## 개인 업로더 본인인증 연동 (후속 과제)

- Phase 1 dev: `ci_hash` 는 frontend 에서 random 88자 base64 생성 stub. 실제 KYC 연동 없음.
- Phase 2 prod: PASS / NICE / 카카오 본인인증 중 하나 통합. redirect + callback → CI 수신 → `/me/uploader/apply` 로 POST.

## 폐기된 대안

- **B. 주민번호 AES-256 암호화 저장**: 법적 근거 불명확해서 기각.
- **원안 유지 + 평문**: 법 위반.

## 참조

- 개인정보보호법 §24-2 (주민등록번호 처리 제한)
- ADR 0001 — 용어 개정 선례 (DDL v3 ↔ v5)
- 요구사항 v5.0 A_600 (개정 필요: "주민등록번호" → "기관: 사업자등록번호 / 개인: 본인인증 CI")
- 기존 approval_documents 패턴 (이벤트 심사용, 이번 건은 승급 심사용)
