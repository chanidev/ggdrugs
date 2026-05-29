-- Phase 2 / ADR 0007 결정 12 — 커뮤니티 게시판(A_802). Post/Comment/PostLike.
-- 만료(GG-POST-010/011/012)는 expires_at 컬럼 + 조회 필터로 처리 (스케줄러 없음 — ADR 0007 결정 10 보정).
-- 주: deleted_at 컬럼은 DEFAULT 절 없음 — soft-delete 전까지 NULL.

CREATE TABLE "posts" (
  "post_id"       BIGSERIAL    PRIMARY KEY,
  "user_id"       BIGINT       NOT NULL,
  "category"      VARCHAR(20)  NOT NULL,
  "title"         VARCHAR(200) NOT NULL,
  "body"          TEXT         NOT NULL,
  "like_count"    INTEGER      NOT NULL DEFAULT 0,
  "comment_count" INTEGER      NOT NULL DEFAULT 0,
  "expires_at"    TIMESTAMPTZ  NOT NULL,
  "is_deleted"    BOOLEAN      NOT NULL DEFAULT false,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "deleted_at"    TIMESTAMPTZ,
  CONSTRAINT "fk_posts_user" FOREIGN KEY ("user_id") REFERENCES "users"("user_id"),
  CONSTRAINT "ck_posts_category" CHECK ("category" IN ('festival_story','mate_finder','free'))
);
CREATE INDEX "idx_posts_category_active" ON "posts"("category","expires_at","created_at" DESC);
CREATE INDEX "idx_posts_user" ON "posts"("user_id","created_at" DESC);

CREATE TABLE "comments" (
  "comment_id"        BIGSERIAL   PRIMARY KEY,
  "post_id"           BIGINT      NOT NULL,
  "user_id"           BIGINT      NOT NULL,
  "parent_comment_id" BIGINT,
  "body"              TEXT        NOT NULL,
  "is_deleted"        BOOLEAN     NOT NULL DEFAULT false,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at"        TIMESTAMPTZ,
  CONSTRAINT "fk_comments_post"   FOREIGN KEY ("post_id")           REFERENCES "posts"("post_id")    ON DELETE CASCADE,
  CONSTRAINT "fk_comments_user"   FOREIGN KEY ("user_id")           REFERENCES "users"("user_id"),
  CONSTRAINT "fk_comments_parent" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("comment_id") ON DELETE CASCADE
);
CREATE INDEX "idx_comments_post"   ON "comments"("post_id","created_at");
CREATE INDEX "idx_comments_parent" ON "comments"("parent_comment_id");
CREATE INDEX "idx_comments_user"   ON "comments"("user_id");

CREATE TABLE "post_likes" (
  "post_like_id" BIGSERIAL   PRIMARY KEY,
  "post_id"      BIGINT      NOT NULL,
  "user_id"      BIGINT      NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "fk_post_likes_post" FOREIGN KEY ("post_id") REFERENCES "posts"("post_id") ON DELETE CASCADE,
  CONSTRAINT "fk_post_likes_user" FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
);
CREATE UNIQUE INDEX "uq_post_like"        ON "post_likes"("post_id","user_id");
CREATE INDEX        "idx_post_likes_post" ON "post_likes"("post_id");
