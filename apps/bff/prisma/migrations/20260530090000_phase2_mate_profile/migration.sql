-- Phase 2 / ADR 0007 — 메이트 프로필 + 지수 (A_801 / A_807). MateProfile, MateIndex.
-- PII(성별/연령대/지역/국적/한국어): 약관 동의(consented_at) 게이트는 라우트에서 강제.
-- 메이트 지수는 기본 50, 갱신은 슬라이스5(평가). 연령대는 5세 단위 정수 하한.

CREATE TABLE "mate_profiles" (
  "mate_profile_id"  BIGSERIAL    NOT NULL,
  "user_id"          BIGINT       NOT NULL,
  "gender"           CHAR(1)      NOT NULL,
  "age_range_lower"  INTEGER      NOT NULL,
  "region_id"        BIGINT,
  "has_car"          BOOLEAN      NOT NULL,
  "nationality"      VARCHAR(20)  NOT NULL,
  "korean_ok"        BOOLEAN      NOT NULL,
  "pref_gender"      CHAR(1),
  "pref_age_lower"   INTEGER,
  "pref_region_id"   BIGINT,
  "pref_has_car"     BOOLEAN,
  "pref_nationality" VARCHAR(20),
  "pref_korean_ok"   BOOLEAN,
  "auto_recommend"   BOOLEAN      NOT NULL DEFAULT false,
  "group_apply"      BOOLEAN      NOT NULL DEFAULT false,
  "consented_at"     TIMESTAMPTZ,
  "is_deleted"       BOOLEAN      NOT NULL DEFAULT false,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"       TIMESTAMPTZ,
  CONSTRAINT "mate_profiles_pkey" PRIMARY KEY ("mate_profile_id"),
  CONSTRAINT "mate_profiles_gender_check" CHECK ("gender" IN ('M','F')),
  CONSTRAINT "mate_profiles_age_check" CHECK ("age_range_lower" IN (10,15,20,25,30,35,40,45,50)),
  CONSTRAINT "mate_profiles_pref_gender_check" CHECK ("pref_gender" IS NULL OR "pref_gender" IN ('M','F'))
);
CREATE UNIQUE INDEX "mate_profiles_user_id_key" ON "mate_profiles"("user_id");
CREATE INDEX "idx_mate_profiles_pool" ON "mate_profiles"("consented_at","region_id");
ALTER TABLE "mate_profiles" ADD CONSTRAINT "mate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id");
ALTER TABLE "mate_profiles" ADD CONSTRAINT "mate_profiles_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("region_id");
ALTER TABLE "mate_profiles" ADD CONSTRAINT "mate_profiles_pref_region_id_fkey" FOREIGN KEY ("pref_region_id") REFERENCES "regions"("region_id");

CREATE TABLE "mate_indexes" (
  "mate_index_id" BIGSERIAL    NOT NULL,
  "user_id"       BIGINT       NOT NULL,
  "index_value"   INTEGER      NOT NULL DEFAULT 50,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mate_indexes_pkey" PRIMARY KEY ("mate_index_id")
);
CREATE UNIQUE INDEX "mate_indexes_user_id_key" ON "mate_indexes"("user_id");
ALTER TABLE "mate_indexes" ADD CONSTRAINT "mate_indexes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id");
