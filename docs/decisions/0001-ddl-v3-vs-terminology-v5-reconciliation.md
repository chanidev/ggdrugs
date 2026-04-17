# ADR 0001 — DDL v3와 요구사항정의서 v5.0 용어집 정합성 정리

- **상태 (Status)**: **Accepted** (2026-04-17)
- **작성일**: 2026-04-17
- **결정일**: 2026-04-17
- **작성자**: Claude Code (LLM Wiki ingest 결과 기반)
- **승인자**: 프로젝트 오너 (찬) — 7건 모두 권장안으로 확정

---

## 1. Context

- 요구사항정의서 v5.0 (2026-04-17, `raw/장원팀_요구사항정의서_5차.docx`)의 **Ⅴ장 용어집**은 CLAUDE.md §5-1에서 "DB 컬럼명·enum 도메인의 유일한 근거"로 지정되었다.
- DB 설계 명세서 v3 및 DDL v3 (`raw/event_curation_ddl_v3.sql`, 2026-04-16)은 용어집 Ⅴ장 확정 **이전에** 선행 작성되었다.
- LLM Wiki ingest 과정에서 용어집과 DDL 간 **7건의 구체적 불일치**가 확인되었다.
- 본 문서는 각 불일치 건에 대해 현황·권장 해소안·결정 필요 사항을 기술한다. 본 ADR이 승인되면 DDL v4로의 마이그레이션 스크립트가 후속 산출된다.

근거 문서:
- [LLM Wiki: 용어집 정본 페이지](../../llm_wiki/wiki/topics/terminology-glossary.md)
- [LLM Wiki: 이벤트 상태 머신](../../llm_wiki/wiki/topics/event-state-machine.md)
- [LLM Wiki: 역할·active_role](../../llm_wiki/wiki/topics/roles-and-active-role.md)
- [LLM Wiki: DB 스키마 개요](../../llm_wiki/wiki/topics/db-schema-overview.md)

---

## 2. 불일치 항목별 상세

### Issue #1 — `events.approval_status` enum 값 불일치

| 항목 | 값 |
|---|---|
| 용어집 | `pending`, `revision_requested`, `rejected`, `approved`, `ended` (단 `ended`는 phase로 이관 해석) |
| DDL v3 | `pending`, `approved`, `on_hold`, `rejected` |

**문제**: `revision_requested` ↔ `on_hold` 같은 의미로 보이나 값이 다름. 현행 DDL 그대로 유지하면 API·프론트·docs 전반에서 용어가 갈라진다.

**권장 해소안**: 용어집 기준으로 통일.
- `events.approval_status` CHECK 제약 값을 `{pending, revision_requested, approved, rejected}`로 변경.
- `approval_logs.action`도 `{approved, revision_requested, rejected}`로 통일.

**결정 필요**: 용어집 값으로 rename 확정 여부.

---

### Issue #2 — `users.active_role` 컬럼 부재

**용어집 명시**: "동일 계정에 여러 역할이 있을 때 현재 활성 역할. 마이페이지 'GG-ROLE-001' 토글 버튼으로 전환. **세션 및 DB active_role 컬럼으로 관리.**"

**DDL v3 현황**: `users` 테이블에 `active_role` 컬럼 **없음**. 토글 상태는 세션에만 있고 DB에 영속화되지 않는 구조.

**권장 해소안**:
```sql
ALTER TABLE users ADD COLUMN active_role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD CONSTRAINT chk_users_active_role
    CHECK (active_role IN ('user', 'uploader'));
```
- admin은 별도 전용 계정이므로 `active_role`에 'admin'이 들어갈 필요 없음 (Issue #3 참조).

**결정 필요**: 컬럼 추가 확정 여부. 기본값 정책 (`'user'` 고정 vs NULL 허용).

---

### Issue #3 — `role` 식별 수단 부재 (특히 admin)

**용어집**: role {user, uploader, admin}. 관리자는 "별도 관리자 전용 계정".

**DDL v3 현황**:
- `users` + `uploader_profiles` 1:1 확장으로 user·uploader는 구분 가능.
- **admin 식별 수단 없음** — `approval_logs.admin_id BIGINT REFERENCES users(user_id)`는 컬럼명만 admin, 실제로는 어떤 user도 가리킬 수 있다.

**후보 해소안**:
- (A) `users.role` enum 추가: `{user, uploader, admin}` — 단일 active role 표현에 수렴, uploader_profiles와 중복 가능성.
- (B) `users.is_admin BOOLEAN` 플래그 + uploader_profiles 유지 — 최소 변경.
- (C) `admin_profiles` 별도 테이블 (users 1:1) — uploader_profiles와 대칭적.

**권장**: (C) `admin_profiles` 신설이 uploader_profiles 패턴과 가장 일관됨. 단, 사용 빈도와 복잡도를 고려하면 (B)도 실무적.

**결정 필요**: A/B/C 중 선택. 관리자 전용 계정 생성 플로우(시드? 관리자가 승격?)도 함께 정의.

---

### Issue #4 — `companion_type` 전용 컬럼 부재

**용어집**:
- `companion_type` — 방문자 측 속성 (필터 조건).
- `expected_companion` — 업로더 측 속성 (업로드 시 상위 2개 선택).
- "DB 레벨에서는 companion_type과 동일 도메인을 공유하지만 의미가 다르므로 **컬럼명을 분리 관리**."

**DDL v3 현황**:
- `events.companion_primary`, `events.companion_secondary` — 업로더 측 (expected_companion에 해당).
- 방문자 측 `companion_type` 컬럼·테이블 **없음**. 필터 요청 파라미터로만 존재할 것으로 추정.

**분석**: 방문자 측 companion_type은 매 요청마다 바뀌는 조건이므로 테이블 컬럼으로 가질 필요 없음. DDL이 합리적.

**권장 해소안**:
- events의 두 컬럼을 용어집 표기에 맞춰 rename: `expected_companion_primary`, `expected_companion_secondary`.
- 또는 `events.expected_companions VARCHAR(20)[]` 배열로 변경(상위 2개 제약은 CHECK로 `array_length ≤ 2`).
- 방문자 측 `companion_type`은 API 계약 문서에만 등장하고 DB에는 두지 않음을 명문화.

**결정 필요**: rename 확정 / 배열 컬럼 사용 여부.

---

### Issue #5 — `event_vibe` ↔ `event_tendency_labels` 네이밍 차이

**용어집**: `event_vibe`.

**DDL v3**: `event_tendency_labels` (마스터) + `event_label_assignments` (N:M 매핑).

**분석**: 개념 동일, 이름만 차이. 정규화 구조 자체는 합리적(여러 라벨 부여 가능, group 분류).

**권장 해소안**: 테이블 이름을 용어집 기준으로 rename.
- `event_tendency_labels` → `event_vibes`
- `event_label_assignments` → `event_vibe_assignments`
- 인덱스명도 함께 변경: `idx_label_assign_*` → `idx_vibe_assign_*`

**결정 필요**: rename 확정 여부. ("tendency_labels"가 더 자기설명적이라는 반론 가능.)

---

### Issue #6 — 리뷰 사진 첨부 매핑 방식 미정

**요구사항**: GG-REVIEW-004 — "최대 5장까지 이미지 첨부. JPG/PNG, 각 10MB 이하."

**DDL v3 현황**:
- `reviews` 테이블에 사진 관련 FK 없음.
- `photo_albums` + `photos` 구조는 이벤트별 사진 앨범용이라 리뷰 첨부와 의미가 다름.

**후보 해소안**:
- (A) `review_photos` 전용 테이블 신설: `(review_photo_id, review_id FK, file_path, mime_type, file_size_bytes, created_at)`.
- (B) 기존 `photos` 테이블 확장: `reviewer_id BIGINT REFERENCES reviews(review_id)` nullable 추가 — 단일 사진 엔티티 관점.
- (C) `photo_albums`에 `album_type VARCHAR(20) CHECK IN ('user', 'review', ...)` 추가 + review_id FK.

**권장**: (A). 리뷰 사진은 라이프사이클·크기 제약·AI 태깅 정책이 유저 앨범과 다르므로 혼합하지 않는 편이 단순.

**결정 필요**: A/B/C 중 선택.

---

### Issue #7 — A_203 "조건 기반 신규 이벤트 알림" 스키마 부재

**요구사항**: GG-UPCOMING-004 — "설정한 지역·기간 조건에 새 이벤트 등록 시 이메일 알림. A_500 알림 설정과 연동."

**DDL v3 현황**: `notifications` 테이블은 `event_id FK`를 가진 **단일 이벤트 기반** 예약 발송 모델. "사용자가 설정한 조건(지역+기간)에 매치되는 신규 이벤트 등록 시" 동작을 표현할 수 없음.

**권장 해소안**: `event_subscriptions` 테이블 신설.
```sql
CREATE TABLE event_subscriptions (
    subscription_id BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(user_id),
    region_ids      BIGINT[] NOT NULL,              -- 구독 대상 지역 (다중)
    period_months   SMALLINT,                        -- 3 | 6 | NULL(전체)
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- 신규 이벤트 승인 시점에 매칭되는 subscription을 찾아 `notifications`에 fan-out 생성.

**결정 필요**: 테이블 명 / 컬럼 구성 / 발송 트리거 시점 (이벤트 approved 직후? 배치?).

---

## 3. Decision (확정)

> 2026-04-17 — 7건 모두 권장안으로 확정. DDL v4 마이그레이션 프리뷰는 아래 §3-1, 후속 산출물 목록은 §4.

| # | 항목 | **확정 결정** |
|---|---|---|
| 1 | approval_status enum 통일 | `on_hold` → `revision_requested` rename |
| 2 | active_role 컬럼 추가 | `users.active_role VARCHAR(20) NOT NULL DEFAULT 'user'` + CHECK IN (user, uploader) |
| 3 | admin 식별 수단 | **`admin_profiles` 전용 테이블 신설** (users 1:1 확장, uploader_profiles와 대칭) |
| 4 | companion 컬럼 rename | `companion_primary`/`companion_secondary` → `expected_companion_primary`/`expected_companion_secondary` |
| 5 | event_vibes rename | `event_tendency_labels` → `event_vibes`, `event_label_assignments` → `event_vibe_assignments` |
| 6 | 리뷰 사진 매핑 | **`review_photos` 전용 테이블 신설** (review_id FK, CASCADE) |
| 7 | event_subscriptions 신설 | `event_subscriptions` 테이블 신설 (region_ids 배열, period_months, is_active). 발송 트리거 시점은 **이벤트 approved 직후** 매칭되는 subscription → notifications fan-out (배치 아님, 동기) |

### 3-1. DDL v4 마이그레이션 프리뷰

> Phase 1에서 Prisma 마이그레이션으로 전환하여 `infra/db/migrations/` 에 기록. 아래는 참조용 SQL 초안.

```sql
-- #1: approval_status enum 통일
ALTER TABLE events
    DROP CONSTRAINT chk_events_approval;
ALTER TABLE events
    ADD CONSTRAINT chk_events_approval
    CHECK (approval_status IN ('pending', 'approved', 'revision_requested', 'rejected'));
-- 기존 on_hold 값 데이터 마이그레이션 (시드 데이터에 한함)
UPDATE events SET approval_status = 'revision_requested' WHERE approval_status = 'on_hold';

ALTER TABLE approval_logs
    DROP CONSTRAINT chk_approval_action;
ALTER TABLE approval_logs
    ADD CONSTRAINT chk_approval_action
    CHECK (action IN ('approved', 'revision_requested', 'rejected'));
UPDATE approval_logs SET action = 'revision_requested' WHERE action = 'on_hold';

-- uploader_profiles도 대칭으로 revision_requested 추가
ALTER TABLE uploader_profiles
    DROP CONSTRAINT chk_uploader_status;
ALTER TABLE uploader_profiles
    ADD CONSTRAINT chk_uploader_status
    CHECK (approval_status IN ('pending', 'approved', 'revision_requested', 'rejected'));

-- #2: active_role 컬럼 추가
ALTER TABLE users
    ADD COLUMN active_role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users
    ADD CONSTRAINT chk_users_active_role
    CHECK (active_role IN ('user', 'uploader'));

-- #3: admin_profiles 신설
CREATE TABLE admin_profiles (
    admin_id     BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL UNIQUE REFERENCES users(user_id),
    department   VARCHAR(100),                        -- 소속 부서 (선택)
    scope        VARCHAR(30)  NOT NULL DEFAULT 'full',-- full | content_only | uploader_review_only
    is_active    BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_admin_scope
        CHECK (scope IN ('full', 'content_only', 'uploader_review_only'))
);
COMMENT ON TABLE admin_profiles IS '관리자 프로필 - users 1:1 확장, uploader_profiles와 대칭';
CREATE INDEX idx_admin_active ON admin_profiles (is_active) WHERE is_active = true;

CREATE TRIGGER trg_admin_profiles_updated
    BEFORE UPDATE ON admin_profiles FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- #4: companion 컬럼 rename
ALTER TABLE events
    RENAME COLUMN companion_primary TO expected_companion_primary;
ALTER TABLE events
    RENAME COLUMN companion_secondary TO expected_companion_secondary;
-- CHECK 제약 이름도 맞춰 변경
ALTER TABLE events
    DROP CONSTRAINT chk_events_companion;
ALTER TABLE events
    ADD CONSTRAINT chk_events_expected_companion_primary
    CHECK (expected_companion_primary IN ('family', 'friend', 'couple', 'solo'));
ALTER TABLE events
    ADD CONSTRAINT chk_events_expected_companion_secondary
    CHECK (expected_companion_secondary IS NULL
        OR expected_companion_secondary IN ('family', 'friend', 'couple', 'solo'));

-- #5: event_vibes rename
ALTER TABLE event_tendency_labels RENAME TO event_vibes;
ALTER TABLE event_vibes RENAME COLUMN label_id   TO vibe_id;
ALTER TABLE event_vibes RENAME COLUMN label_name TO vibe_name;
ALTER TABLE event_vibes RENAME COLUMN label_group TO vibe_group;
ALTER TABLE event_vibes DROP CONSTRAINT chk_label_group;
ALTER TABLE event_vibes
    ADD CONSTRAINT chk_vibe_group CHECK (vibe_group IN ('mood', 'activity', 'theme'));

ALTER TABLE event_label_assignments RENAME TO event_vibe_assignments;
ALTER TABLE event_vibe_assignments RENAME COLUMN label_id TO vibe_id;
ALTER INDEX idx_label_assign_event RENAME TO idx_vibe_assign_event;
ALTER INDEX idx_label_assign_label RENAME TO idx_vibe_assign_vibe;
-- UNIQUE 제약 이름도
ALTER TABLE event_vibe_assignments
    DROP CONSTRAINT uq_event_label;
ALTER TABLE event_vibe_assignments
    ADD CONSTRAINT uq_event_vibe UNIQUE (event_id, vibe_id);

-- #6: review_photos 신설
CREATE TABLE review_photos (
    review_photo_id   BIGSERIAL    PRIMARY KEY,
    review_id         BIGINT       NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
    file_path         VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(30)  NOT NULL,
    file_size_bytes   INT          NOT NULL,
    sort_order        SMALLINT     NOT NULL DEFAULT 0,  -- 1~5 순서
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_review_photo_mime
        CHECK (mime_type IN ('image/jpeg', 'image/png')),
    CONSTRAINT chk_review_photo_size
        CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)  -- 10MB
);
COMMENT ON TABLE review_photos IS '리뷰 첨부 사진 - 리뷰당 최대 5장 (앱 레벨 제약), GG-REVIEW-004';
CREATE INDEX idx_review_photos_review ON review_photos (review_id, sort_order);

-- #7: event_subscriptions 신설
CREATE TABLE event_subscriptions (
    subscription_id BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id),
    region_ids      BIGINT[]     NOT NULL,           -- 구독 대상 지역 (다중, regions FK 검증은 앱 레벨)
    period_months   SMALLINT,                        -- 3 | 6 | NULL(전체)
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_subscription_period
        CHECK (period_months IS NULL OR period_months IN (3, 6))
);
COMMENT ON TABLE event_subscriptions IS 'A_203 예정 이벤트 조건 기반 알림 구독';
COMMENT ON COLUMN event_subscriptions.region_ids IS 'regions FK의 정수 배열 - 참조 무결성은 앱 레벨에서 검증';

CREATE INDEX idx_subscriptions_user ON event_subscriptions (user_id) WHERE is_active = true;
CREATE INDEX idx_subscriptions_active ON event_subscriptions USING gin (region_ids) WHERE is_active = true;

CREATE TRIGGER trg_event_subscriptions_updated
    BEFORE UPDATE ON event_subscriptions FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 발송 트리거: 이벤트 approved 시 매칭되는 subscription을 찾아 notifications에 fan-out
-- (구현 패턴 — 실제로는 BFF 애플리케이션 계층에서 트랜잭션으로 처리 권장)
-- Phase 1에서 BFF의 event-approval 핸들러에 로직 추가.
```

---

## 4. Consequences — 후속 작업 목록

**즉시 적용 (본 ADR Accepted 직후)**:
- [x] LLM Wiki 토픽 페이지 5개(`terminology-glossary`, `event-state-machine`, `roles-and-active-role`, `filters-5-types`, `db-schema-overview`)의 contradictions 섹션 정리 — 해소된 항목 취소선 + 본 ADR 링크.
- [x] 본 ADR §3에 DDL v4 프리뷰 SQL 수록 완료.

**Phase 1 진입 시**:
- [ ] `apps/bff/` 에 Prisma 초기화 → 본 ADR §3-1 기준 schema.prisma 작성.
- [ ] `pnpm --filter bff prisma migrate dev --name 0001_initial_schema` 으로 초기 마이그레이션 산출 → `infra/db/migrations/` 에 기록.
- [ ] `packages/shared-types/` 에 enum·DTO 정의 추가:
  - `ApprovalStatus`, `EventPhase`, `ActiveRole`, `AdminScope`, `EventVibeGroup`, `ExpectedCompanion`.
- [ ] 시드 데이터(samples, fixtures) 본 ADR 네이밍으로 작성.
- [ ] BFF의 event-approval 핸들러에 event_subscriptions fan-out 로직 추가 (A_700 승인 직후 매칭 → notifications insert).

**문서 동기화**:
- [ ] `llm_wiki/raw/event_curation_ddl_v4.sql` 작성 필요 여부 결정 (raw/는 append-only이므로 v3는 유지, v4는 별도 파일로 추가).
- [ ] `llm_wiki/wiki/sources/` 에 DDL v4 페이지 신설 + log.md 엔트리.

**리스크 / 완화**:
- 현 Phase 0 단계라 DDL v3를 기준으로 작성된 애플리케이션 코드는 없음 → 영향 범위 제한적.
- `event_subscriptions.region_ids` 가 BIGINT[] 배열이라 Prisma에서 다루기 번거로울 수 있음. Prisma의 `Int[]` / `BigInt[]` 지원 범위 확인 후, 필요 시 별도 `event_subscription_regions` join 테이블로 변경할 여지 남김 (Phase 1 재평가 포인트).
- 마이그레이션 단계에서 `on_hold` 값을 가진 데이터가 없어야 하므로 시드 데이터 검토 필요 (현재 시드 없음 → 무해).

---

## 5. References

- 요구사항정의서 v5.0 Ⅴ장 용어집 — `llm_wiki/raw/장원팀_요구사항정의서_5차.docx`
- DDL v3 — `llm_wiki/raw/event_curation_ddl_v3.sql`
- CLAUDE.md §5-1 "용어 통일" / §6 "금지사항"
- LLM Wiki 관련 토픽 — `llm_wiki/wiki/topics/terminology-glossary.md` 외
