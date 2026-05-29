# Slice 1 — Community Shell + Board (A_800 / A_802)

> For agentic workers: REQUIRED SUB-SKILL — invoke `superpowers:test-driven-development` (red→green→refactor) for every Task below; never write implementation before a failing test.

**Goal.** Phase 2 의 첫 슬라이스. 커뮤니티 페이지 셸(A_800: 크레딧 placeholder, 게시판 3카테고리+전체 그리드, 채팅방이동/언어토글/알림 placeholder, 우측 메이트추천 placeholder)과 게시판/게시글 전체 흐름(A_802: GG-COMM-001~005, GG-POST-001~012)을 service→API→UI→test→ship 까지 한 번에 닫는다. 메이트·매칭·채팅·크레딧 적립·실 i18n 은 후속 슬라이스이며 이 슬라이스에서는 **placeholder/스캐폴드만** 둔다.

**Architecture.** 기존 수직 슬라이스 패턴(Bookmark/Review)을 그대로 모방한다: Prisma 모델+마이그레이션 → BFF 라우트(`requireAuth`/`resolveAuth` 게이트 + 트랜잭션 + 멱등성) → web API 클라이언트 모듈 → React 페이지(useState/useContext, AbortController, CSS 변수). 신규 모델 `Post` / `Comment`(자기참조 1단계 대댓글) / `PostLike`(토글). 게시글 7일 만료는 **쿼리 시점 필터**(`expiresAt > now()`)로 비노출 + 데이터 보관 — 스케줄러 불필요(YAGNI). **이는 ADR 0007 결정 10(만료=백그라운드 스케줄러)을 게시글 만료 항목에 한해 의도적으로 대체하는 결정이다 — 무언의 뒤집기 금지(.claude/CLAUDE.md 금지 #1) 차원에서 Task 1 에서 ADR 0007 에 보정 메모를 추가하고 Task 9 docs 커밋에 명시한다. (타임아웃 스케줄러 본체 — 신청 24h/투표 36h 등 — 는 후속 슬라이스에서 결정 10 그대로 도입.)**

**Tech Stack.** BFF: Express + Prisma + Postgres. Web: React 19 + Vite + react-router v7 + Tailwind v4. 인증: 기존 `alle_sid` 세션. 테스트: BFF 는 **신규 직접호출(in-process) 하니스**(`src/jobs/community-eval.ts`) — 라우트 핸들러를 `import` 해 mock req/res 로 직접 호출한다. `chat-eval.ts` 의 PASS/FAIL **구조적 assertion 철학만 차용**하고, chat-eval 이 쓰는 HTTP 통합 방식(dev 서버 기동 + `--base` 로 fetch)은 **사용하지 않는다**. 따라서 community:eval 은 **서버 기동 불요**(Postgres 연결만 필요). Web 은 typecheck/build gate. enum 은 전부 `String + @db.VarChar` 컨벤션.

**핵심 결정 (이 슬라이스 한정).**
- 카테고리 = `String @db.VarChar(20)`, 값 `festival_story | mate_finder | free`. 마스터 테이블 없음(고정 3종, YAGNI). Prisma 는 CHECK 를 표현 못 하므로 **마이그레이션 SQL 에 `CONSTRAINT ck_posts_category CHECK (...)` 명시**(Task 1).
- 만료 = `Post.expiresAt = createdAt + 7d` 컬럼 + 조회 시 `expiresAt > now()` 필터. 비노출이지 삭제 아님(GG-POST-010/011/012). **댓글/대댓글은 게시글에 종속해서만 노출되는 경로뿐이라**(댓글 단독 조회 엔드포인트 없음), 게시글이 404 되면 댓글·대댓글도 함께 비노출 → GG-POST-011 자연 충족. **Task 2 에 이 동작을 잠그는 만료 회귀 케이스 1건 추가**(아래).
- 대댓글 = `Comment.parentCommentId` self-FK. depth 1 강제: 부모가 이미 대댓글이면 **422 `reply_to_reply_not_allowed`**. (GG-POST-003) — 422 vs 400 선택은 컨벤션상 "요청 형식은 맞으나 도메인 규칙 위반(unprocessable)"으로 보아 422 채택. 부모 댓글이 같은 게시글에 속하지 않으면 404 `parent comment not found`(parent 조회 where 에 `postId` 동봉).
- 좋아요 = `PostLike` unique(userId,postId) 토글 + `Post.likeCount` 캐시 컬럼. **트랜잭션 내부에서 계산한 count 를 클로저 변수에 담아 그대로 응답**한다(트랜잭션 밖 재count 없음 — bookmarks.ts 의 밖-재count 패턴을 의도적으로 단순화). **목록 응답에는 `liked`(본인 좋아요 여부) 없음 — 의도된 단순화**: 목록 카드는 정적 카운트만 표시하고, `liked` 토글 상태는 상세에서만 다룬다. 추후 카드 하트 채움이 필요하면 `listPosts` where 에 사용자 like LEFT JOIN 이 필요함을 메모로 남긴다.
- 작성자 프로필 모달 = 닉네임만 실데이터, 메이트지수/채팅신청은 placeholder(GG-POST-008/009 → 슬라이스 4/5).
- 언어토글/크레딧/채팅이동/알림 = 셸 placeholder. **이 슬라이스는 i18n 0줄**: react-i18next 미도입, 언어토글 버튼은 `disabled` 라벨 placeholder(실 locale 전환·게시글 번역은 슬라이스 7). 알림 아이콘만 기존 `/notifications` 라우트로 실연결(이미 존재).
- **메이트찾기(mate_finder) 게시판의 "작성자→댓글자 1:1 신청"(ADR 결정 12 단서, GG-MATE-007/008) 은 후속 슬라이스 이관** — 이 슬라이스에는 진입점 placeholder 도 두지 않는다(매칭 도메인 모델 부재). 이관 사실만 본 플랜·Task 9 에 1줄 기록.

---

## File Structure

### 생성

| 경로 | 책임 |
|---|---|
| `apps/bff/prisma/migrations/20260530090000_phase2_community_posts/migration.sql` | Post/Comment/PostLike 테이블 + 인덱스 + FK + CHECK |
| `apps/bff/src/routes/posts.ts` | 게시글/댓글/대댓글/좋아요 라우트 핸들러 전체 |
| `apps/bff/src/jobs/community-eval.ts` | in-process 직접호출 검증 하니스(PASS/FAIL) |
| `apps/web/src/lib/api/posts.ts` | 게시글/댓글/좋아요 web API 클라이언트 모듈 |
| `apps/web/src/pages/CommunityPage/index.tsx` | A_800 커뮤니티 셸 (탭+그리드+placeholder들) |
| `apps/web/src/pages/CommunityPage/parts/CommunityShell.tsx` | 레이아웃 래퍼(헤더줄: 크레딧/언어/채팅/알림 placeholder) |
| `apps/web/src/pages/CommunityPage/parts/CategoryGrid.tsx` | 게시판 3카테고리 + 전체 그리드 |
| `apps/web/src/pages/CommunityPage/parts/PostList.tsx` | 카테고리별 목록(presentational) |
| `apps/web/src/pages/CommunityPage/parts/MateRecoPlaceholder.tsx` | 우측 메이트추천 placeholder |
| `apps/web/src/pages/CommunityPage/parts/ComposeModal.tsx` | 글쓰기/수정 겸용 모달(controlled form) |
| `apps/web/src/pages/PostDetailPage/index.tsx` | A_802 게시글 상세(본문/댓글/대댓글/좋아요) |
| `apps/web/src/pages/PostDetailPage/parts/CommentTree.tsx` | 댓글+대댓글 1단계 렌더 |
| `apps/web/src/pages/PostDetailPage/parts/CommentComposer.tsx` | 댓글/대댓글 작성 |
| `apps/web/src/pages/PostDetailPage/parts/AuthorProfileModal.tsx` | 작성자 프로필 모달(닉네임 + placeholder) |

### 수정

| 경로 | 변경 |
|---|---|
| `apps/bff/prisma/schema.prisma` | `Post`/`Comment`/`PostLike` 모델 추가 + `User` 역관계 3줄 추가 |
| `apps/bff/src/app.ts` | import 1줄 + posts 라우트 8종 등록 |
| `apps/bff/package.json` | `community:eval` 스크립트 |
| `apps/web/src/lib/api/index.ts` | `export * from './posts.js'` |
| `apps/web/src/main.tsx` | `/community`, `/community/posts/:id` 라우트 |
| `apps/web/src/pages/MyPage/index.tsx` | 커뮤니티 진입 버튼(GG-MY-006) — **`MyPage/index.tsx` 확정**. `MyPage.tsx` 는 존재하지 않으며 `pages/MyPage` 는 폴더 index 이므로 index.tsx 가 유일 대상 |
| `docs/decisions/0007-phase2-community-mate-matching.md` | 결정 10 보정 메모(게시글 만료=쿼리필터, 스케줄러 미사용) — Task 1 |

> **Import 확장자 컨벤션(중요).** 이 레포는 NodeNext ESM 이지만 **페이지 진입점(`main.tsx` → pages, 페이지 → `lib/auth-context`, 페이지 → `components/*`, 페이지 → `layout/*`)은 확장자 없이** import 하고(예: 기존 `import { MyPage } from './pages/MyPage'`, `import { Header } from '../../layout/Header'`), **같은 페이지 폴더 내부 `parts/*`·`lib/api/*` 상대 import 만 `.js`** 를 붙인다(예: MyPage 의 `./parts/PageShell.js`). 본 플랜의 모든 import 는 이 규칙을 따른다. Header import 는 `parts/CommunityShell.tsx` 기준 `../../../layout/Header`(확장자 없음).

---

## 공유 타입 / 명명 규약 (Task 간 일관)

BFF 응답 직렬화 형태 (web 인터페이스와 1:1). **BFF 쪽에 댓글 노드 타입을 명시 `interface` 로 선언**해 `toNode` 의 self-referential 추론(ts7022) 을 피한다:

```typescript
// PostListItem (목록) — liked 없음(의도된 단순화)
{ postId: string; category: string; title: string; authorNickname: string;
  commentCount: number; likeCount: number; createdAt: string }
// PostDetail (상세)
{ postId: string; category: string; title: string; body: string;
  authorUserId: string; authorNickname: string; likeCount: number;
  liked: boolean; createdAt: string; isMine: boolean; comments: CommentNodeOut[] }
// CommentNodeOut (BFF) / CommentNode (Web) — 동일 형태
{ commentId: string; parentCommentId: string | null; authorUserId: string;
  authorNickname: string; body: string; createdAt: string; isMine: boolean;
  replies: CommentNodeOut[] }
```

카테고리 상수(BFF·Web 공용 값): `'festival_story' | 'mate_finder' | 'free'`.

**Task 실행 순서 = 번호 순서.** ComposeModal(생성+수정 겸용)을 **Task 5b 로 앞당겨** Task 6/7 이 import 하기 전에 존재하게 한다(아래 번호대로 실행하면 모든 build green 이 번호 순서로 성립). 최종 순서: **1 → 2 → 3 → 4 → 5 → 5b(ComposeModal) → 6 → 7 → 8(회귀/마감)**.

---

## Task 1 — Prisma 모델 + 마이그레이션 + ADR 보정 (Foundation)

**Files:** `apps/bff/prisma/schema.prisma`, `apps/bff/prisma/migrations/20260530090000_phase2_community_posts/migration.sql`, `docs/decisions/0007-phase2-community-mate-matching.md`

- [ ] **red (검증 방식):** 모델이 없으면 Task 2 의 하니스가 컴파일 실패하므로, 이 Task 는 schema → migration → generate 순으로 진행하고 검증은 `npx prisma validate` 로 한다. 변경 전 상태 확인:
  - 명령: `cd apps/bff && npx prisma format` 후 schema 수정 → `npm run prisma:validate`
- [ ] **`schema.prisma` 의 `User` 모델 역관계 추가.** User 모델의 역관계 블록 **마지막 relation 라인(`adminAuditLogs AdminAuditLog[]`) 바로 다음 줄에 3줄을 삽입**한다. (User 모델의 `@@unique`/`@@map` 같은 블록 속성 라인보다 **위**, relation 필드 그룹 안에 추가 — 기존 relation 들과 같은 들여쓰기.)
```prisma
  posts              Post[]
  comments           Comment[]
  postLikes          PostLike[]
```
  - 정확한 삽입 규칙: `adminAuditLogs ... AdminAuditLog[]` 라인을 grep 으로 찾아 그 **바로 아래**에 위 3줄을 넣는다. `@@unique`/`@@index`/`@@map` 등 블록 속성은 그대로 아래로 밀린다.
- [ ] `schema.prisma` 끝(마지막 모델 뒤)에 3개 모델 추가:
```prisma
// =============================================================
// POSTS  (Phase 2 / ADR 0007 결정 12 — A_802 게시판)
// =============================================================
model Post {
  postId       BigInt    @id @default(autoincrement()) @map("post_id")
  userId       BigInt    @map("user_id")
  // festival_story | mate_finder | free  (고정 3종, 마스터 테이블 없음. CHECK 는 마이그레이션 SQL 에)
  category     String    @map("category") @db.VarChar(20)
  title        String    @db.VarChar(200)
  body         String    @db.Text
  likeCount    Int       @default(0) @map("like_count")
  commentCount Int       @default(0) @map("comment_count")
  // 작성 후 7일 (GG-POST-010). 조회 시 expiresAt > now() 필터 — 비노출이지 삭제 아님(GG-POST-012).
  expiresAt    DateTime  @map("expires_at") @db.Timestamptz
  isDeleted    Boolean   @default(false) @map("is_deleted")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz

  user     User       @relation(fields: [userId], references: [userId])
  comments Comment[]
  likes    PostLike[]

  @@index([category, expiresAt, createdAt(sort: Desc)], map: "idx_posts_category_active")
  @@index([userId, createdAt(sort: Desc)], map: "idx_posts_user")
  @@map("posts")
}

// =============================================================
// COMMENTS  (자기참조 — 대댓글 1단계만, 대댓글에 답글 불가 GG-POST-003)
// =============================================================
model Comment {
  commentId       BigInt    @id @default(autoincrement()) @map("comment_id")
  postId          BigInt    @map("post_id")
  userId          BigInt    @map("user_id")
  // NULL = 최상위 댓글, 값 있으면 대댓글. depth 1 강제는 라우트에서 검증(GG-POST-003).
  parentCommentId BigInt?   @map("parent_comment_id")
  body            String    @db.Text
  isDeleted       Boolean   @default(false) @map("is_deleted")
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt       DateTime? @map("deleted_at") @db.Timestamptz

  post    Post      @relation(fields: [postId], references: [postId], onDelete: Cascade)
  user    User      @relation(fields: [userId], references: [userId])
  parent  Comment?  @relation("CommentReplies", fields: [parentCommentId], references: [commentId], onDelete: Cascade)
  replies Comment[] @relation("CommentReplies")

  @@index([postId, createdAt], map: "idx_comments_post")
  @@index([parentCommentId], map: "idx_comments_parent")
  @@index([userId], map: "idx_comments_user")
  @@map("comments")
}

// =============================================================
// POST_LIKES  (좋아요/하트 토글)
// =============================================================
model PostLike {
  postLikeId BigInt   @id @default(autoincrement()) @map("post_like_id")
  postId     BigInt   @map("post_id")
  userId     BigInt   @map("user_id")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  post Post @relation(fields: [postId], references: [postId], onDelete: Cascade)
  user User @relation(fields: [userId], references: [userId])

  @@unique([postId, userId], map: "uq_post_like")
  @@index([postId], map: "idx_post_likes_post")
  @@map("post_likes")
}
```
- [ ] 마이그레이션 디렉터리 `20260530090000_phase2_community_posts/` 를 **수동 생성**(개발 DB 동기화는 Prisma 가 함). 디렉터리/파일명 형식은 기존 마이그레이션(`YYYYMMDDHHMMSS_`)을 따른다. `migration.sql` 작성(Prisma 생성 DDL 과 동일 + CHECK + `deleted_at` 은 DEFAULT 없음 → NULL):
```sql
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
```
- [ ] **ADR 0007 보정 메모 추가** — `docs/decisions/0007-phase2-community-mate-matching.md` 결정 10 항목 끝에 1줄 추가(무언의 결정 뒤집기 방지, .claude/CLAUDE.md 금지 #1):
```markdown
   - **보정(슬라이스1, 2026-05-30)**: 위 타임아웃 중 **게시글 만료 7일**은 스케줄러 대신 **조회 시점 쿼리 필터(`expires_at > now()`)** 로 구현한다(비노출 + 데이터 보관 GG-POST-010/011/012 을 동일하게 충족, YAGNI). 신청/투표/약속 등 나머지 타임아웃 스케줄러 본체는 후속 슬라이스에서 본 결정대로 도입.
```
- [ ] **green:** 마이그레이션 적용 + client 재생성:
  - 명령: `cd apps/bff && npm run prisma:migrate:deploy && npm run prisma:generate`
  - 기대출력: `migration ... applied` (또는 `No pending migrations`/`up to date`), `Generated Prisma Client`. 에러 0.
- [ ] **commit:** `feat(bff): Post/Comment/PostLike 모델 + 마이그레이션 (ADR 0007 A_802)` + `docs(decisions): ADR 0007 결정10 게시글 만료=쿼리필터 보정`

---

## Task 2 — BFF: 게시글 목록 + 상세 + 만료 비노출 + 검증 하니스 (GG-COMM-004/005, GG-POST-001/010/011/012)

**Files:** `apps/bff/src/routes/posts.ts`, `apps/bff/src/jobs/community-eval.ts`, `apps/bff/package.json`, `apps/bff/src/app.ts`

> **하니스 성격(명시).** community-eval 은 **handler-direct(in-process) 단위 하니스** — Express 미들웨어 계층(실 `requireAuth` DB 조회·`express.json` 파싱)을 **우회**하고 핸들러를 직접 호출한다. mock 이 `req.auth` 를 직접 채우므로 `requireAuth` 의 세션 검증은 타지 않는다. 이는 의도된 단위 레벨 검증이며(LLM judge 없음 — CLAUDE.md 금지 #4 준수), **서버 기동 불요**(Postgres 연결만 필요, `dotenv -e ../../.env`). 풀 통합(미들웨어·쿠키 경유)은 Task 8 의 수동 E2E 로 보완.

- [ ] **red — 검증 하니스 + 첫 케이스 작성.** `community-eval.ts` 생성:
```typescript
import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { listPosts, getPostDetail, createPost } from '../routes/posts.js';

interface MockReq { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; auth?: { userId: bigint; nickname: string; activeRole: string }; }
interface Captured { status: number; json: unknown; }

function mockRes(): Response & { _c: Captured } {
  const c: Captured = { status: 200, json: undefined };
  const res = {
    _c: c,
    status(s: number) { c.status = s; return this; },
    json(b: unknown) { c.json = b; return this; },
  } as unknown as Response & { _c: Captured };
  return res;
}
function mockReq(r: MockReq): Request {
  return { params: r.params ?? {}, query: r.query ?? {}, body: r.body ?? {}, auth: r.auth } as unknown as Request;
}

interface CaseResult { id: string; pass: boolean; failures: string[]; }
const results: CaseResult[] = [];
function check(id: string, fn: () => Promise<string[]>) {
  return fn().then((failures) => results.push({ id, pass: failures.length === 0, failures }))
    .catch((e) => results.push({ id, pass: false, failures: [`threw: ${String(e)}`] }));
}

async function main() {
  // 시드: 테스트 유저 1명 (실 세션 불요 — auth 객체를 직접 주입).
  const u = await prisma.user.findFirst({ where: { isDeleted: false }, select: { userId: true, nickname: true, activeRole: true } });
  if (!u) { console.error('no user to test with'); process.exit(1); }
  const auth = { userId: u.userId, nickname: u.nickname, activeRole: u.activeRole };

  // CASE create: 게시글 작성 → 201 + postId 반환
  let createdPostId = '';
  await check('post.create.ok', async () => {
    const res = mockRes();
    await createPost(mockReq({ auth, body: { category: 'free', title: 'eval 제목', body: 'eval 본문입니다' } }), res);
    const f: string[] = [];
    if (res._c.status !== 201) f.push(`status ${res._c.status} != 201`);
    const b = res._c.json as { postId?: string };
    if (!b?.postId) f.push('no postId'); else createdPostId = b.postId;
    return f;
  });

  // CASE create invalid category → 400
  await check('post.create.bad_category', async () => {
    const res = mockRes();
    await createPost(mockReq({ auth, body: { category: 'nope', title: 'xx', body: 'yyy' } }), res);
    return res._c.status === 400 ? [] : [`status ${res._c.status} != 400`];
  });

  // CASE list: free 카테고리에 방금 글 + 페이지네이션 필드 검증
  await check('post.list.free', async () => {
    const res = mockRes();
    await listPosts(mockReq({ query: { category: 'free' } }), res);
    const b = res._c.json as { items?: Array<{ postId: string }>; page?: number; limit?: number; total?: number };
    const f: string[] = [];
    if (!b?.items?.some((i) => i.postId === createdPostId)) f.push('created post not in list');
    if (!b?.page || !b?.limit || b?.total === undefined) f.push('missing pagination fields');
    return f;
  });

  // CASE detail: 작성자 본인 → isMine true, liked false
  await check('post.detail.isMine', async () => {
    const res = mockRes();
    await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), res);
    const b = res._c.json as { isMine?: boolean; liked?: boolean };
    const f: string[] = [];
    if (res._c.status !== 200) f.push(`status ${res._c.status}`);
    if (b?.isMine !== true) f.push('isMine != true');
    if (b?.liked !== false) f.push('liked != false');
    return f;
  });

  // CASE detail 404 (없는 id)
  await check('post.detail.404', async () => {
    const res = mockRes();
    await getPostDetail(mockReq({ params: { id: '999999999' } }), res);
    return res._c.status === 404 ? [] : [`status ${res._c.status} != 404`];
  });

  // CASE 만료 비노출 (GG-POST-010/011/012): expires_at 를 과거로 직접 갱신 →
  //   목록 미포함 + 상세 404 (→ 종속 댓글/대댓글도 동반 비노출).
  await check('post.expired.hidden', async () => {
    const f: string[] = [];
    await prisma.post.update({
      where: { postId: BigInt(createdPostId) },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const rl = mockRes();
    await listPosts(mockReq({ query: { category: 'free' } }), rl);
    const lb = rl._c.json as { items?: Array<{ postId: string }> };
    if (lb?.items?.some((i) => i.postId === createdPostId)) f.push('expired post still in list');
    const rd = mockRes();
    await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), rd);
    if (rd._c.status !== 404) f.push(`expired detail ${rd._c.status} != 404`);
    // 후속 댓글 케이스를 위해 만료 복구.
    await prisma.post.update({
      where: { postId: BigInt(createdPostId) },
      data: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    return f;
  });

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}${r.failures.length ? ' :: ' + r.failures.join('; ') : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}
void main();
```
- [ ] `package.json` scripts 에 line 33(`"chat:eval": ...`) 아래 추가: `"community:eval": "dotenv -e ../../.env -- tsx src/jobs/community-eval.ts",`
- [ ] **red 확인:** `cd apps/bff && npm run community:eval`
  - 기대출력: `posts.js` 의 `listPosts`/`getPostDetail`/`createPost` 미존재 → tsx 컴파일 에러로 비정상 종료. 이것이 red. (서버는 띄우지 않는다 — Postgres 만 필요.)
- [ ] **green — `posts.ts` 의 타입·헬퍼·list/detail/create 구현:**
```typescript
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../middleware/require-auth.js';

const CATEGORIES = new Set(['festival_story', 'mate_finder', 'free']);
const POST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d (GG-POST-010)

// 댓글 트리 노드 — 명시 interface 로 self-referential 추론(ts7022) 회피.
export interface CommentNodeOut {
  commentId: string;
  parentCommentId: string | null;
  authorUserId: string;
  authorNickname: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  replies: CommentNodeOut[];
}

// posts.ts 전용 private 헬퍼 (bookmarks.ts 의 parseIntClamp 는 export 안 되어 있어 재사용 불가 → 자체 정의).
function parseIntClamp(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
function parseBigId(raw: unknown): bigint | null {
  const s = typeof raw === 'string' ? raw : '';
  try { const n = BigInt(s); return n > 0n ? n : null; } catch { return null; }
}

/** GET /community/posts?category=&page=&limit= — 만료 전 게시글 목록 (GG-COMM-004). category 생략=전체. */
export async function listPosts(req: Request, res: Response) {
  const cat = typeof req.query.category === 'string' ? req.query.category : '';
  if (cat && !CATEGORIES.has(cat)) { res.status(400).json({ error: 'invalid category' }); return; }
  const page = parseIntClamp(req.query.page, 1, 1, 1_000_000);
  const limit = parseIntClamp(req.query.limit, 20, 1, 100);

  const where: Prisma.PostWhereInput = {
    isDeleted: false,
    expiresAt: { gt: new Date() }, // GG-POST-010 만료 비노출
    ...(cat ? { category: cat } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        postId: true, category: true, title: true, likeCount: true,
        commentCount: true, createdAt: true,
        user: { select: { nickname: true } },
      },
    }),
  ]);

  res.json({
    page, limit, total,
    items: rows.map((p) => ({
      postId: p.postId.toString(),
      category: p.category,
      title: p.title,
      authorNickname: p.user.nickname,
      commentCount: p.commentCount,
      likeCount: p.likeCount,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

/** GET /community/posts/:id — 상세 + 댓글/대댓글 트리 (GG-POST-001/005). resolveAuth 로 liked/isMine. */
export async function getPostDetail(req: Request, res: Response) {
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }
  const auth = (req as AuthenticatedRequest).auth as AuthenticatedRequest['auth'] | undefined;

  const post = await prisma.post.findFirst({
    where: { postId, isDeleted: false, expiresAt: { gt: new Date() } },
    select: {
      postId: true, category: true, title: true, body: true, likeCount: true,
      createdAt: true, userId: true,
      user: { select: { nickname: true } },
      comments: {
        where: { isDeleted: false },
        orderBy: [{ createdAt: 'asc' }, { commentId: 'asc' }],
        select: {
          commentId: true, parentCommentId: true, body: true, createdAt: true,
          userId: true, user: { select: { nickname: true } },
        },
      },
    },
  });
  if (!post) { res.status(404).json({ error: 'not found' }); return; }

  const liked = auth
    ? (await prisma.postLike.count({ where: { postId, userId: auth.userId } })) > 0
    : false;

  // 댓글 트리 구성 (대댓글 1단계). 반환 타입 명시(CommentNodeOut).
  type Flat = (typeof post.comments)[number];
  const toNode = (c: Flat): CommentNodeOut => ({
    commentId: c.commentId.toString(),
    parentCommentId: c.parentCommentId ? c.parentCommentId.toString() : null,
    authorUserId: c.userId.toString(),
    authorNickname: c.user.nickname,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    isMine: auth ? c.userId === auth.userId : false,
    replies: [],
  });
  const byId = new Map<string, CommentNodeOut>();
  const roots: CommentNodeOut[] = [];
  for (const c of post.comments) byId.set(c.commentId.toString(), toNode(c));
  for (const c of post.comments) {
    const node = byId.get(c.commentId.toString())!;
    if (c.parentCommentId && byId.has(c.parentCommentId.toString())) {
      byId.get(c.parentCommentId.toString())!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  res.json({
    postId: post.postId.toString(),
    category: post.category,
    title: post.title,
    body: post.body,
    authorUserId: post.userId.toString(),
    authorNickname: post.user.nickname,
    likeCount: post.likeCount,
    liked,
    isMine: auth ? post.userId === auth.userId : false,
    createdAt: post.createdAt.toISOString(),
    comments: roots,
  });
}

/** POST /community/posts — 글쓰기 (requireAuth). expiresAt = now + 7d. */
export async function createPost(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const category = typeof body.category === 'string' ? body.category : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';

  if (!CATEGORIES.has(category)) { res.status(400).json({ error: 'invalid category' }); return; }
  if (title.length < 2 || title.length > 200) { res.status(400).json({ error: 'title 은 2~200자' }); return; }
  if (text.length < 2 || text.length > 5000) { res.status(400).json({ error: 'body 는 2~5000자' }); return; }

  const created = await prisma.post.create({
    data: {
      userId: auth.userId, category, title, body: text,
      expiresAt: new Date(Date.now() + POST_TTL_MS),
    },
    select: { postId: true, category: true, title: true, body: true, createdAt: true },
  });

  res.status(201).json({
    postId: created.postId.toString(),
    category: created.category,
    title: created.title,
    body: created.body,
    authorNickname: auth.nickname,
    likeCount: 0,
    commentCount: 0,
    createdAt: created.createdAt.toISOString(),
  });
}
```
- [ ] `app.ts` 등록. **import 는 line 24(`import { addBookmark, ... } from './routes/bookmarks.js';`) 다음 줄에 추가**, 라우트는 events 블록 인근(예: line 224 `/places/search` 등록 뒤)에 추가. `requireAuth`/`resolveAuth` 는 이미 line 23 에서 import 됨:
```typescript
// import 섹션 (line 24 아래):
import { listPosts, getPostDetail, createPost } from './routes/posts.js';
```
```typescript
// createApp() 내부, /places/search 등록 다음:
  app.get('/community/posts', (req, res, next) => listPosts(req, res).catch(next));
  app.get(
    '/community/posts/:id',
    (req, res, next) => resolveAuth(req, res, next).catch(next),
    (req, res, next) => getPostDetail(req, res).catch(next),
  );
  app.post(
    '/community/posts',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => createPost(req, res).catch(next),
  );
```
- [ ] **green 확인:** `cd apps/bff && npm run community:eval`
  - 기대출력(서버 미기동): `PASS post.create.ok` / `PASS post.create.bad_category` / `PASS post.list.free` / `PASS post.detail.isMine` / `PASS post.detail.404` / `PASS post.expired.hidden`, 마지막 줄 `6/6 passed`, 종료코드 0.
- [ ] **commit:** `feat(bff): 게시글 목록/상세/작성 + 만료 비노출 + community-eval 하니스 (GG-COMM-004/005, GG-POST-001/010/011/012)`

---

## Task 3 — BFF: 댓글/대댓글 작성·수정·삭제 (GG-POST-002/003/006/007)

**Files:** `apps/bff/src/routes/posts.ts`, `apps/bff/src/jobs/community-eval.ts`, `apps/bff/src/app.ts`

- [ ] **red — 케이스 추가** (`community-eval.ts` 의 `main()` 안, 만료 케이스 뒤 — 만료를 복구해 둔 상태에서 진행). import 줄에 `createComment, updateComment, deleteComment` 추가:
```typescript
  // CASE comment: 작성 → 201, root parent null, commentCount 반영
  let rootCommentId = '';
  await check('comment.create.ok', async () => {
    const res = mockRes();
    await createComment(mockReq({ params: { id: createdPostId }, auth, body: { body: '댓글 본문' } }), res);
    const b = res._c.json as { commentId?: string; parentCommentId?: string | null };
    const f: string[] = [];
    if (res._c.status !== 201) f.push(`status ${res._c.status}`);
    if (!b?.commentId) f.push('no commentId'); else rootCommentId = b.commentId;
    if (b?.parentCommentId !== null) f.push('root parent must be null');
    return f;
  });

  // CASE reply: 대댓글 1단계 OK
  let replyId = '';
  await check('comment.reply.ok', async () => {
    const res = mockRes();
    await createComment(mockReq({ params: { id: createdPostId }, auth, body: { body: '대댓글', parentCommentId: rootCommentId } }), res);
    const b = res._c.json as { commentId?: string; parentCommentId?: string | null };
    if (b?.commentId) replyId = b.commentId;
    return b?.parentCommentId === rootCommentId ? [] : ['reply parent mismatch'];
  });

  // CASE reply-to-reply: depth 2 금지 → 422 (GG-POST-003)
  await check('comment.reply.depth2_blocked', async () => {
    const res = mockRes();
    await createComment(mockReq({ params: { id: createdPostId }, auth, body: { body: 'x', parentCommentId: replyId } }), res);
    return res._c.status === 422 ? [] : [`status ${res._c.status} != 422`];
  });

  // CASE comment delete: 본인 → soft-delete 성공(200) + 상세 트리에서 제외
  await check('comment.delete.excluded', async () => {
    const rd = mockRes();
    await deleteComment(mockReq({ params: { id: replyId }, auth }), rd);
    const f: string[] = [];
    if (rd._c.status !== 200) f.push(`delete status ${rd._c.status}`);
    // 게시글은 soft-delete 자식이 있어도 생존 → detail 200, 단 삭제된 대댓글은 트리에서 빠짐.
    const rg = mockRes();
    await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), rg);
    const gb = rg._c.json as { comments?: Array<{ commentId: string; replies: Array<{ commentId: string }> }> };
    const stillThere = gb?.comments?.some((c) => c.replies.some((r) => r.commentId === replyId));
    if (stillThere) f.push('deleted reply still in tree');
    return f;
  });
```
> **삭제 케이스 의미(명시).** `comment.delete.excluded` 는 *게시글 404* 를 검증하지 않는다(게시글은 자식 soft-delete 후에도 생존). 검증 대상은 "본인 대댓글 soft-delete 200 + 상세 트리에서 해당 대댓글 제외"다. depth2 차단 케이스가 만든 손자는 없으므로 `replyId` 삭제로 충분.
- [ ] **red 확인:** `npm run community:eval` → 신규 import 미존재로 컴파일 실패.
- [ ] **green — `posts.ts` 에 추가** (parent 조회 where 에 `postId` 동봉 → 타 게시글 부모 지정 시 404, 즉 ownership 검증):
```typescript
/** POST /community/posts/:id/comments — 댓글/대댓글 (requireAuth). 대댓글 depth 1 강제(GG-POST-003). */
export async function createComment(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length < 1 || text.length > 1000) { res.status(400).json({ error: 'body 는 1~1000자' }); return; }

  const parentRaw = body.parentCommentId;
  let parentCommentId: bigint | null = null;
  if (parentRaw !== undefined && parentRaw !== null && parentRaw !== '') {
    parentCommentId = parseBigId(parentRaw);
    if (!parentCommentId) { res.status(400).json({ error: 'invalid parentCommentId' }); return; }
  }

  const post = await prisma.post.findFirst({
    where: { postId, isDeleted: false, expiresAt: { gt: new Date() } },
    select: { postId: true },
  });
  if (!post) { res.status(404).json({ error: 'post not found' }); return; }

  if (parentCommentId !== null) {
    // postId 동봉 — 부모가 같은 게시글 소속이 아니면 404 (cross-post parent 방어).
    const parent = await prisma.comment.findFirst({
      where: { commentId: parentCommentId, postId, isDeleted: false },
      select: { parentCommentId: true },
    });
    if (!parent) { res.status(404).json({ error: 'parent comment not found' }); return; }
    // depth 1 강제 — 대댓글에 답글 불가 (GG-POST-003). 요청 형식은 유효하나 도메인 규칙 위반 → 422.
    if (parent.parentCommentId !== null) {
      res.status(422).json({ error: 'reply_to_reply_not_allowed' });
      return;
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({
      data: { postId, userId: auth.userId, parentCommentId, body: text },
      select: { commentId: true, parentCommentId: true, body: true, createdAt: true },
    });
    const count = await tx.comment.count({ where: { postId, isDeleted: false } });
    await tx.post.update({ where: { postId }, data: { commentCount: count } });
    return c;
  });

  res.status(201).json({
    commentId: created.commentId.toString(),
    parentCommentId: created.parentCommentId ? created.parentCommentId.toString() : null,
    authorUserId: auth.userId.toString(),
    authorNickname: auth.nickname,
    body: created.body,
    createdAt: created.createdAt.toISOString(),
    isMine: true,
    replies: [],
  });
}

/** PATCH /community/comments/:id — 본인 댓글 수정 (GG-POST-006). */
export async function updateComment(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const commentId = parseBigId(req.params.id);
  if (!commentId) { res.status(400).json({ error: 'invalid id' }); return; }

  const text = typeof (req.body ?? {}).body === 'string' ? String((req.body as Record<string, unknown>).body).trim() : '';
  if (text.length < 1 || text.length > 1000) { res.status(400).json({ error: 'body 는 1~1000자' }); return; }

  const existing = await prisma.comment.findUnique({
    where: { commentId },
    select: { commentId: true, userId: true, isDeleted: true },
  });
  if (!existing || existing.isDeleted) { res.status(404).json({ error: 'comment not found' }); return; }
  if (existing.userId !== auth.userId) { res.status(403).json({ error: 'forbidden' }); return; }

  const updated = await prisma.comment.update({
    where: { commentId },
    data: { body: text },
    select: { commentId: true, body: true, updatedAt: true },
  });
  res.json({ commentId: updated.commentId.toString(), body: updated.body, updatedAt: updated.updatedAt.toISOString() });
}

/** DELETE /community/comments/:id — 본인 댓글 soft-delete (GG-POST-007). commentCount 재계산. */
export async function deleteComment(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const commentId = parseBigId(req.params.id);
  if (!commentId) { res.status(400).json({ error: 'invalid id' }); return; }

  const existing = await prisma.comment.findUnique({
    where: { commentId },
    select: { commentId: true, userId: true, postId: true, isDeleted: true },
  });
  if (!existing || existing.isDeleted) { res.status(404).json({ error: 'comment not found' }); return; }
  if (existing.userId !== auth.userId) { res.status(403).json({ error: 'forbidden' }); return; }

  await prisma.$transaction(async (tx) => {
    await tx.comment.update({ where: { commentId }, data: { isDeleted: true, deletedAt: new Date() } });
    const count = await tx.comment.count({ where: { postId: existing.postId, isDeleted: false } });
    await tx.post.update({ where: { postId: existing.postId }, data: { commentCount: count } });
  });
  res.json({ ok: true });
}
```
- [ ] `app.ts` import 줄 확장 + 라우트 등록:
```typescript
import { listPosts, getPostDetail, createPost, createComment, updateComment, deleteComment } from './routes/posts.js';
```
```typescript
  app.post(
    '/community/posts/:id/comments',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => createComment(req, res).catch(next),
  );
  app.patch(
    '/community/comments/:id',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => updateComment(req, res).catch(next),
  );
  app.delete(
    '/community/comments/:id',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => deleteComment(req, res).catch(next),
  );
```
- [ ] community-eval 의 import 줄에 `createComment, updateComment, deleteComment` 추가.
- [ ] **green 확인:** `cd apps/bff && npm run community:eval`
  - 기대출력: 기존 6 + `PASS comment.create.ok` / `PASS comment.reply.ok` / `PASS comment.reply.depth2_blocked` / `PASS comment.delete.excluded`, `10/10 passed`, 종료코드 0.
- [ ] **commit:** `feat(bff): 댓글/대댓글 작성·수정·삭제 + depth1 강제 (GG-POST-002/003/006/007)`

---

## Task 4 — BFF: 게시글 수정·삭제 + 좋아요 토글 (GG-POST-004/005, 좋아요)

**Files:** `apps/bff/src/routes/posts.ts`, `apps/bff/src/jobs/community-eval.ts`, `apps/bff/src/app.ts`

- [ ] **red — 케이스 추가** (import 에 `updatePost, deletePost, toggleLike` 추가):
```typescript
  // CASE post update: 본인 → 200
  await check('post.update.ok', async () => {
    const res = mockRes();
    await updatePost(mockReq({ params: { id: createdPostId }, auth, body: { title: '수정된 제목', body: '수정된 본문' } }), res);
    return res._c.status === 200 ? [] : [`status ${res._c.status}`];
  });

  // CASE like toggle: on(liked true, count 1) → off(liked false, count 0)
  await check('post.like.toggle', async () => {
    const r1 = mockRes();
    await toggleLike(mockReq({ params: { id: createdPostId }, auth }), r1);
    const b1 = r1._c.json as { liked?: boolean; likeCount?: number };
    const r2 = mockRes();
    await toggleLike(mockReq({ params: { id: createdPostId }, auth }), r2);
    const b2 = r2._c.json as { liked?: boolean; likeCount?: number };
    const f: string[] = [];
    if (b1?.liked !== true || b1?.likeCount !== 1) f.push(`first toggle ${JSON.stringify(b1)}`);
    if (b2?.liked !== false || b2?.likeCount !== 0) f.push(`second toggle ${JSON.stringify(b2)}`);
    return f;
  });

  // CASE post delete: 본인 → soft-delete, 이후 detail 404
  await check('post.delete.then404', async () => {
    const rd = mockRes();
    await deletePost(mockReq({ params: { id: createdPostId }, auth }), rd);
    const rg = mockRes();
    await getPostDetail(mockReq({ params: { id: createdPostId }, auth }), rg);
    const f: string[] = [];
    if (rd._c.status !== 200) f.push(`delete status ${rd._c.status}`);
    if (rg._c.status !== 404) f.push(`after-delete detail ${rg._c.status} != 404`);
    return f;
  });
```
- [ ] **red 확인:** `npm run community:eval` → 미존재 import 로 실패.
- [ ] **green — `posts.ts` 에 추가** (좋아요: **트랜잭션 내부 count 를 클로저 변수에 담아 그대로 응답** — 트랜잭션 밖 재count 제거):
```typescript
/** PATCH /community/posts/:id — 본인 게시글 수정 (GG-POST-004). category 변경 불가. */
export async function updatePost(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (title.length < 2 || title.length > 200) { res.status(400).json({ error: 'title 은 2~200자' }); return; }
  if (text.length < 2 || text.length > 5000) { res.status(400).json({ error: 'body 는 2~5000자' }); return; }

  const existing = await prisma.post.findFirst({
    where: { postId, isDeleted: false, expiresAt: { gt: new Date() } },
    select: { postId: true, userId: true },
  });
  if (!existing) { res.status(404).json({ error: 'post not found' }); return; }
  if (existing.userId !== auth.userId) { res.status(403).json({ error: 'forbidden' }); return; }

  const updated = await prisma.post.update({
    where: { postId },
    data: { title, body: text },
    select: { postId: true, title: true, body: true, updatedAt: true },
  });
  res.json({ postId: updated.postId.toString(), title: updated.title, body: updated.body, updatedAt: updated.updatedAt.toISOString() });
}

/** DELETE /community/posts/:id — 본인 게시글 soft-delete (GG-POST-005). */
export async function deletePost(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }

  const existing = await prisma.post.findFirst({
    where: { postId, isDeleted: false },
    select: { postId: true, userId: true },
  });
  if (!existing) { res.status(404).json({ error: 'post not found' }); return; }
  if (existing.userId !== auth.userId) { res.status(403).json({ error: 'forbidden' }); return; }

  await prisma.post.update({ where: { postId }, data: { isDeleted: true, deletedAt: new Date() } });
  res.json({ ok: true });
}

/** POST /community/posts/:id/like — 좋아요/하트 토글. likeCount 캐시 갱신. 응답은 in-tx 계산값. */
export async function toggleLike(req: Request, res: Response) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) { res.status(401).json({ error: 'unauthenticated' }); return; }
  const postId = parseBigId(req.params.id);
  if (!postId) { res.status(400).json({ error: 'invalid id' }); return; }

  const post = await prisma.post.findFirst({
    where: { postId, isDeleted: false, expiresAt: { gt: new Date() } },
    select: { postId: true },
  });
  if (!post) { res.status(404).json({ error: 'post not found' }); return; }

  let liked = false;
  let likeCount = 0;
  await prisma.$transaction(async (tx) => {
    const del = await tx.postLike.deleteMany({ where: { postId, userId: auth.userId } });
    if (del.count === 0) {
      // 없었음 → 좋아요 추가. 동시 POST 경합(둘 다 del.count=0)에서 한쪽이 P2002 →
      // 멱등 안전망으로 liked=true 유지(이미 타 요청이 생성). 최종 count 는 아래서 in-tx 재집계.
      try {
        await tx.postLike.create({ data: { postId, userId: auth.userId } });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
      liked = true;
    } else {
      liked = false;
    }
    // 트랜잭션 내부에서 계산 → 응답에 그대로 사용(트랜잭션 밖 재count 없음 → DB-응답 정합).
    likeCount = await tx.postLike.count({ where: { postId } });
    await tx.post.update({ where: { postId }, data: { likeCount } });
  });

  res.json({ liked, likeCount });
}
```
> **멱등성 주석(설계 명시).** Postgres 기본 격리(Read Committed)에서 두 동시 토글이 모두 `del.count=0` 을 보면 둘 다 create 를 시도하고 unique 제약이 한쪽을 P2002 로 막는다 → catch 로 무시하고 `liked=true` 유지. `likeCount` 는 **트랜잭션 내부 재집계값**이라 항상 DB 와 일치한다(밖 재count 의 경합 창 제거). 단일 유저 직렬 호출(하니스 케이스)뿐 아니라 동시성에서도 응답·DB 가 어긋나지 않는다.
- [ ] `app.ts` import 확장 + 라우트:
```typescript
import { listPosts, getPostDetail, createPost, updatePost, deletePost, toggleLike, createComment, updateComment, deleteComment } from './routes/posts.js';
```
```typescript
  app.patch(
    '/community/posts/:id',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => updatePost(req, res).catch(next),
  );
  app.delete(
    '/community/posts/:id',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => deletePost(req, res).catch(next),
  );
  app.post(
    '/community/posts/:id/like',
    (req, res, next) => requireAuth(req, res, next).catch(next),
    (req, res, next) => toggleLike(req, res).catch(next),
  );
```
- [ ] community-eval import 줄에 `updatePost, deletePost, toggleLike` 추가.
- [ ] **green 확인:** `cd apps/bff && npm run community:eval` → `13/13 passed`, 종료코드 0.
- [ ] **typecheck:** `cd apps/bff && npm run build` → 에러 0.
- [ ] **commit:** `feat(bff): 게시글 수정·삭제 + 좋아요 토글 (GG-POST-004/005)`

---

## Task 5 — Web: API 클라이언트 모듈 `posts.ts`

**Files:** `apps/web/src/lib/api/posts.ts`, `apps/web/src/lib/api/index.ts`

> **환경 전제(VITE_BFF_URL).** `client.ts` 가 이미 `BFF_URL = VITE_BFF_URL ?? '/api'` 를 export 한다. dev 는 Vite proxy 의 `/api`, 배포는 `VITE_BFF_URL`. posts.ts 는 그대로 `BFF_URL` 을 재사용하며 신규 env 추가 없음.

- [ ] **red:** posts 모듈이 없으면 Task 6 이후 페이지가 컴파일 실패. 이 Task 는 모듈을 먼저 만들고 `npm run typecheck` 로 검증한다(현재는 통과 — 아직 import 하는 페이지 없음).
- [ ] **green — `posts.ts` 작성** (events.ts/reviews.ts 패턴, `withCredentials`/semantic 에러코드):
```typescript
import { BFF_URL, withCredentials } from './client.js';

export type PostCategory = 'festival_story' | 'mate_finder' | 'free';

export interface PostListItem {
  postId: string;
  category: PostCategory;
  title: string;
  authorNickname: string;
  commentCount: number;
  likeCount: number;
  createdAt: string;
}
export interface PostListResponse { page: number; limit: number; total: number; items: PostListItem[]; }

export interface CommentNode {
  commentId: string;
  parentCommentId: string | null;
  authorUserId: string;
  authorNickname: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  replies: CommentNode[];
}
export interface PostDetail {
  postId: string;
  category: PostCategory;
  title: string;
  body: string;
  authorUserId: string;
  authorNickname: string;
  likeCount: number;
  liked: boolean;
  isMine: boolean;
  createdAt: string;
  comments: CommentNode[];
}

export async function fetchPosts(
  query: { category?: PostCategory; page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<PostListResponse> {
  const sp = new URLSearchParams();
  if (query.category) sp.set('category', query.category);
  if (query.page) sp.set('page', String(query.page));
  if (query.limit) sp.set('limit', String(query.limit));
  const qs = sp.toString();
  const res = await fetch(`${BFF_URL}/community/posts${qs ? `?${qs}` : ''}`, withCredentials(signal ? { signal } : {}));
  if (!res.ok) throw new Error(`GET /community/posts ${res.status}`);
  return (await res.json()) as PostListResponse;
}

export async function fetchPostDetail(id: string, signal?: AbortSignal): Promise<PostDetail> {
  const res = await fetch(`${BFF_URL}/community/posts/${encodeURIComponent(id)}`, withCredentials(signal ? { signal } : {}));
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GET /community/posts/${id} ${res.status}`);
  return (await res.json()) as PostDetail;
}

export async function createPost(body: { category: PostCategory; title: string; body: string }): Promise<PostListItem> {
  const res = await fetch(`${BFF_URL}/community/posts`, withCredentials({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`POST /community/posts ${res.status}: ${t.slice(0, 200)}`); }
  return (await res.json()) as PostListItem;
}

export async function updatePost(id: string, body: { title: string; body: string }): Promise<void> {
  const res = await fetch(`${BFF_URL}/community/posts/${encodeURIComponent(id)}`, withCredentials({
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`PATCH /community/posts/${id} ${res.status}`);
}

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`${BFF_URL}/community/posts/${encodeURIComponent(id)}`, withCredentials({ method: 'DELETE' }));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`DELETE /community/posts/${id} ${res.status}`);
}

export async function togglePostLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const res = await fetch(`${BFF_URL}/community/posts/${encodeURIComponent(id)}/like`, withCredentials({ method: 'POST' }));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`POST /community/posts/${id}/like ${res.status}`);
  return (await res.json()) as { liked: boolean; likeCount: number };
}

export async function createComment(
  postId: string,
  body: { body: string; parentCommentId?: string },
): Promise<CommentNode> {
  const res = await fetch(`${BFF_URL}/community/posts/${encodeURIComponent(postId)}/comments`, withCredentials({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 422) throw new Error('REPLY_TO_REPLY_NOT_ALLOWED');
  if (!res.ok) throw new Error(`POST /community/posts/${postId}/comments ${res.status}`);
  return (await res.json()) as CommentNode;
}

export async function updateComment(id: string, body: { body: string }): Promise<void> {
  const res = await fetch(`${BFF_URL}/community/comments/${encodeURIComponent(id)}`, withCredentials({
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`PATCH /community/comments/${id} ${res.status}`);
}

export async function deleteComment(id: string): Promise<void> {
  const res = await fetch(`${BFF_URL}/community/comments/${encodeURIComponent(id)}`, withCredentials({ method: 'DELETE' }));
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 403) throw new Error('FORBIDDEN');
  if (!res.ok) throw new Error(`DELETE /community/comments/${id} ${res.status}`);
}
```
- [ ] `index.ts` barrel 에 추가: `export * from './posts.js';`
- [ ] **green 확인:** `cd apps/web && npm run typecheck` → 에러 0.
- [ ] **commit:** `feat(web): community posts API 클라이언트 모듈`

---

## Task 5b — Web: 글쓰기/수정 모달 ComposeModal (Task 6/7 의 선행 의존)

**Files:** `apps/web/src/pages/CommunityPage/parts/ComposeModal.tsx`

> **순서(중요).** Task 6(CommunityPage) 과 Task 7(PostDetailPage) 이 모두 `./parts/ComposeModal.js` 를 import 하므로, **ComposeModal 을 Task 6 보다 앞 번호(5b)로 둔다.** 이렇게 하면 번호 순서대로 실행해도 Task 6/7 의 build green 이 성립한다. ComposeModal 은 처음부터 생성+수정 겸용 본구현으로 만든다(stub 단계 없음).
>
> **CSS 변수 전제.** `apps/web/src/styles/index.css` 에 `--radius-md`/`--radius-lg`/`--color-accent`/`--color-border`/`--color-surface`/`--color-bg`/`--color-text-muted` 등이 정의되어 있음(확인 완료). 신규 변수 도입 없음.

- [ ] **green — `ComposeModal.tsx`** (controlled form, GG-POST-004 재사용):
```tsx
import { useState } from 'react';
import { createPost, updatePost, type PostCategory, type PostDetail } from '../../../lib/api/posts.js';
import { CATEGORY_LABELS } from './CommunityShell.js';

const CATS: PostCategory[] = ['festival_story', 'mate_finder', 'free'];

export function ComposeModal({ defaultCategory, editPost, onClose, onCreated }: {
  defaultCategory?: PostCategory;
  editPost?: PostDetail;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [category, setCategory] = useState<PostCategory>(editPost ? editPost.category : (defaultCategory ?? 'free'));
  const [title, setTitle] = useState(editPost?.title ?? '');
  const [body, setBody] = useState(editPost?.body ?? '');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const t = title.trim();
    const b = body.trim();
    if (t.length < 2 || b.length < 2) { setErr('제목과 본문을 2자 이상 입력하세요.'); return; }
    setPending(true);
    setErr(null);
    try {
      if (editPost) await updatePost(editPost.postId, { title: t, body: b });
      else await createPost({ category, title: t, body: b });
      onCreated();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m === 'UNAUTHENTICATED' ? '로그인이 필요해요.' : '저장하지 못했어요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[480px] max-w-[92vw] rounded-(--radius-lg) bg-(--color-surface) p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[16px] font-semibold">{editPost ? '게시글 수정' : '글쓰기'}</h3>
        {!editPost && (
          <div className="mb-3 flex gap-2">
            {CATS.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`rounded-(--radius-md) border px-3 py-1.5 text-[13px] ${category === c ? 'border-(--color-accent) text-(--color-accent)' : 'border-(--color-border)'}`}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        )}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" maxLength={200}
          className="mb-3 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) px-3 py-2 text-[14px]" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="내용" rows={8} maxLength={5000}
          className="mb-3 w-full resize-none rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) px-3 py-2 text-[14px]" />
        {err && <p className="mb-2 text-[13px] text-(--color-accent)">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-(--radius-md) border border-(--color-border) px-4 py-2 text-[14px]">취소</button>
          <button type="button" onClick={submit} disabled={pending} className="rounded-(--radius-md) bg-(--color-accent) px-4 py-2 text-[14px] text-white disabled:opacity-60">
            {editPost ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
```
> ComposeModal 은 `CommunityShell.js` 의 `CATEGORY_LABELS` 를 import 한다 → **CommunityShell.tsx 를 ComposeModal 보다 먼저 만들거나, 둘을 같은 작업 단위로 묶어 생성**한다(Task 6 에서 CommunityShell 부터 작성하므로, 실무상 Task 6 의 CommunityShell/CategoryGrid 코드를 먼저 두고 ComposeModal 을 이어 작성해도 무방 — 단 typecheck 는 둘 다 존재해야 통과). 안전하게: 이 Task 에서 ComposeModal 작성 시 `CATEGORY_LABELS` 가 없으면 Task 6 의 CommunityShell 부터 생성 후 typecheck.
- [ ] **green 확인:** Task 6 의 CommunityShell 까지 존재하는 시점에 `cd apps/web && npm run typecheck` → 에러 0. (ComposeModal 단독 typecheck 는 CommunityShell 의존으로 Task 6 과 함께 통과.)
- [ ] **commit:** `feat(web): 글쓰기/수정 모달 ComposeModal (GG-POST-004 재사용)`

---

## Task 6 — Web: 커뮤니티 셸 A_800 (GG-COMM-001~005, 006, 013, 016, 017 + GG-MY-006)

**Files:** `apps/web/src/pages/CommunityPage/index.tsx`, `parts/CommunityShell.tsx`, `parts/CategoryGrid.tsx`, `parts/PostList.tsx`, `parts/MateRecoPlaceholder.tsx`, `apps/web/src/main.tsx`, `apps/web/src/pages/MyPage/index.tsx`

- [ ] **red:** `main.tsx` 에 import + 라우트 추가 후 `npm run typecheck` → CommunityPage 미존재로 실패 확인. (기존 페이지 import 컨벤션과 동일하게 **확장자 없이**, 폴더 index 경유):
```tsx
import { CommunityPage } from './pages/CommunityPage';
// <Routes> 안 (다른 Route 들 사이):
        <Route path="/community" element={<CommunityPage />} />
```
- [ ] **green — `parts/CommunityShell.tsx`** (헤더줄 placeholder: 크레딧/언어토글/채팅이동/알림; 알림만 실링크. **Header import 는 `../../../layout/Header` — 확장자 없음, 기존 페이지 컨벤션 일치**):
```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Header } from '../../../layout/Header';

const CATEGORY_LABELS: Record<string, string> = {
  festival_story: '축제 이야기',
  mate_finder: '메이트 찾기',
  free: '자유게시판',
};
export { CATEGORY_LABELS };

export function CommunityShell({ children, rightRail }: { children: ReactNode; rightRail: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-(--color-bg) text-(--color-text)">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] gap-6 px-6 py-6">
          <main className="min-w-0 flex-1">
            <div className="mb-5 flex items-center justify-between">
              <h1 className="text-(length:--text-h2) font-semibold">커뮤니티</h1>
              <div className="flex items-center gap-2">
                {/* GG-COMM-017 크레딧 placeholder (슬라이스 6) */}
                <span className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted)" title="크레딧 (준비 중)">
                  크레딧 0개
                </span>
                {/* GG-COMM-013 언어토글 placeholder — 실 i18n 미도입(슬라이스 7) */}
                <button type="button" disabled className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted) opacity-60" title="언어 변경 (준비 중)">
                  한국어
                </button>
                {/* GG-COMM-014/015 채팅방 이동 placeholder (슬라이스 5) */}
                <button type="button" disabled className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] text-(--color-text-muted) opacity-60" title="채팅방 (준비 중)">
                  채팅방
                </button>
                {/* GG-COMM-016 알림 — 기존 페이지로 실연결 */}
                <Link to="/notifications" className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px] hover:border-(--color-border-hover)">
                  알림
                </Link>
              </div>
            </div>
            {children}
          </main>
          <aside className="hidden w-[300px] shrink-0 md:block">{rightRail}</aside>
        </div>
      </div>
    </div>
  );
}
```
- [ ] **`parts/CategoryGrid.tsx`** (전체 + 3카테고리, GG-COMM-003):
```tsx
import type { PostCategory } from '../../../lib/api/posts.js';
import { CATEGORY_LABELS } from './CommunityShell.js';

export type CategoryFilter = 'all' | PostCategory;
const ITEMS: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'festival_story', label: CATEGORY_LABELS.festival_story },
  { key: 'mate_finder', label: CATEGORY_LABELS.mate_finder },
  { key: 'free', label: CATEGORY_LABELS.free },
];

export function CategoryGrid({ active, onSelect }: { active: CategoryFilter; onSelect: (c: CategoryFilter) => void }) {
  return (
    <div role="tablist" className="mb-4 grid grid-cols-4 gap-2">
      {ITEMS.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={active === it.key}
          onClick={() => onSelect(it.key)}
          className={`rounded-(--radius-md) border px-3 py-2 text-[14px] transition-colors ${
            active === it.key
              ? 'border-(--color-accent) bg-(--color-accent) text-white'
              : 'border-(--color-border) bg-(--color-surface) hover:border-(--color-border-hover)'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
```
- [ ] **`parts/PostList.tsx`** (presentational, GG-COMM-005 진입 = `Link to /community/posts/:id`):
```tsx
import { Link } from 'react-router';
import type { PostListItem } from '../../../lib/api/posts.js';
import { CATEGORY_LABELS } from './CommunityShell.js';

export function PostList({ items, loading, error }: { items: PostListItem[]; loading: boolean; error: string | null }) {
  if (loading) return <div className="py-12 text-center text-(--color-text-muted)">불러오는 중…</div>;
  if (error) return <div className="py-12 text-center text-(--color-text-muted)">불러오지 못했어요</div>;
  if (items.length === 0) return <div className="py-12 text-center text-(--color-text-muted)">아직 게시글이 없어요</div>;
  return (
    <ul className="flex flex-col divide-y divide-(--color-border) rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
      {items.map((p) => (
        <li key={p.postId}>
          {/* GG-COMM-005 게시글 상세 진입 */}
          <Link to={`/community/posts/${p.postId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-(--color-bg)">
            <div className="min-w-0">
              <span className="mr-2 rounded-(--radius-sm) bg-(--color-bg) px-1.5 py-0.5 text-[11px] text-(--color-text-muted)">
                {CATEGORY_LABELS[p.category] ?? p.category}
              </span>
              <span className="text-[15px]">{p.title}</span>
              <div className="mt-1 truncate text-[12px] text-(--color-text-muted)">
                {p.authorNickname} · 댓글 {p.commentCount} · 하트 {p.likeCount}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```
> **목록 좋아요 표시(의도된 단순화).** 카드는 정적 `하트 N` 카운트만 보여준다. 본인 좋아요 여부(`liked`)는 목록 응답에 없고 상세에서만 토글한다(GG-COMM-004 의 "표시"는 카운트로 충족). 카드에 하트 채움 상태가 필요해지면 `listPosts` where 에 사용자 like 조인이 필요함 — 후속 확장 메모.
- [ ] **`parts/MateRecoPlaceholder.tsx`** (GG-COMM-006 고정 배치. **카피에 후속(GG-COMM-007/008) 의도 1줄 명시**):
```tsx
export function MateRecoPlaceholder() {
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
      <h2 className="mb-2 text-[15px] font-semibold">메이트 추천</h2>
      {/* GG-COMM-007/008 후속 이관: 정보 미입력=블라인드 목록+유도, 입력완료=프로필 목록 (슬라이스 3~4) */}
      <p className="mb-3 text-[13px] text-(--color-text-muted)">메이트 매칭 정보를 입력하면 추천 목록이 노출돼요. (준비 중)</p>
      <button type="button" disabled className="w-full rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[13px] text-(--color-text-muted) opacity-60" title="준비 중">
        메이트 추천 받기
      </button>
    </div>
  );
}
```
- [ ] **`index.tsx`** (목록 fetch + 카테고리 전환 + 글쓰기 게이트, GG-COMM-001/002/004. **AbortController cleanup 필수 — useEffect return 에서 `ctrl.abort()`**):
```tsx
import { useCallback, useEffect, useState } from 'react';
import { CommunityShell } from './parts/CommunityShell.js';
import { CategoryGrid, type CategoryFilter } from './parts/CategoryGrid.js';
import { PostList } from './parts/PostList.js';
import { MateRecoPlaceholder } from './parts/MateRecoPlaceholder.js';
import { ComposeModal } from './parts/ComposeModal.js';
import { fetchPosts, type PostListItem } from '../../lib/api/posts.js';
import { useCurrentUser } from '../../lib/auth-context';

export function CommunityPage() {
  const { user } = useCurrentUser();
  const [cat, setCat] = useState<CategoryFilter>('all');
  const [items, setItems] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback((c: CategoryFilter, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    fetchPosts(c === 'all' ? {} : { category: c }, signal)
      .then((r) => { setItems(r.items); setLoading(false); })
      .catch((e: unknown) => { if ((e as Error).name !== 'AbortError') { setError('ERROR'); setLoading(false); } });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(cat, ctrl.signal);
    return () => ctrl.abort(); // cleanup — 카테고리 전환 시 이전 요청 취소.
  }, [cat, load]);

  return (
    <CommunityShell rightRail={<MateRecoPlaceholder />}>
      <CategoryGrid active={cat} onSelect={setCat} />
      <div className="mb-3 flex justify-end">
        {/* GG-COMM-002 글쓰기 — 비로그인은 disabled + 로그인 유도 title (숨김 대신 노출). */}
        <button
          type="button"
          onClick={() => { if (user) setComposeOpen(true); }}
          disabled={!user}
          title={user ? '글쓰기' : '로그인이 필요해요'}
          className="rounded-(--radius-md) bg-(--color-accent) px-4 py-2 text-[14px] text-white disabled:opacity-50"
        >
          글쓰기
        </button>
      </div>
      <PostList items={items} loading={loading} error={error} />
      {composeOpen && (
        <ComposeModal
          defaultCategory={cat === 'all' ? 'free' : cat}
          onClose={() => setComposeOpen(false)}
          onCreated={() => { setComposeOpen(false); load(cat); }}
        />
      )}
    </CommunityShell>
  );
}
```
> **글쓰기 게이트 결정(명시).** 비로그인 시 버튼을 **숨기지 않고 `disabled` + `title="로그인이 필요해요"`** 로 둔다(존재를 알리되 클릭 차단). 서버는 `requireAuth` 로 최종 차단. 좋아요/댓글 등 다른 비로그인 클릭은 PostDetail 의 `alert('로그인이 필요해요')` 로 유도(Task 7).
- [ ] **MyPage 진입 버튼(GG-MY-006).** 수정 대상 = **`apps/web/src/pages/MyPage/index.tsx`** (MyPage.tsx 는 없음; `pages/MyPage` 는 폴더 index). 삽입 위치 = 로그인 상태 헤더의 액션 영역(현재 `<RoleToggleButton />` 가 있는 `<header className="mb-6 flex items-end justify-between">` 우측 그룹). RoleToggleButton 을 `<div className="flex items-center gap-2">` 로 감싸 그 안에 커뮤니티 Link 추가:
```tsx
import { Link } from 'react-router';
// ... <header> 우측:
        <div className="flex items-center gap-2">
          {/* GG-MY-006 마이페이지 → 커뮤니티 진입 */}
          <Link
            to="/community"
            className="inline-flex h-9 items-center rounded-(--radius-md) border border-(--color-border) px-3 text-[13px] font-medium hover:border-(--color-border-hover)"
          >
            커뮤니티
          </Link>
          <RoleToggleButton />
        </div>
```
  (기존 `<RoleToggleButton />` 단독 라인을 위 블록으로 치환. `Link` import 가 MyPage/index.tsx 에 없으면 상단에 추가.)
- [ ] **green 확인:** `cd apps/web && npm run typecheck && npm run build` → 에러 0. (ComposeModal·CommunityShell 은 Task 5b/이 Task 에서 이미 존재 → import 해소.)
- [ ] **commit:** `feat(web): 커뮤니티 셸 A_800 + 카테고리 목록 + 마이페이지 진입 (GG-COMM-001~006/013/016/017, GG-MY-006)`

---

## Task 7 — Web: 게시글 상세 A_802 (GG-COMM-005, GG-POST-001~009)

**Files:** `apps/web/src/pages/PostDetailPage/index.tsx`, `parts/CommentTree.tsx`, `parts/CommentComposer.tsx`, `parts/AuthorProfileModal.tsx`, `apps/web/src/main.tsx`

- [ ] **red:** `main.tsx` 에 `import { PostDetailPage } from './pages/PostDetailPage';` + `<Route path="/community/posts/:id" element={<PostDetailPage />} />` 추가 → `typecheck` 실패 확인.
- [ ] **green — `parts/AuthorProfileModal.tsx`** (GG-POST-008/009: 닉네임 실데이터, 메이트지수/채팅신청 placeholder):
```tsx
export function AuthorProfileModal({ nickname, onClose }: { nickname: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[320px] rounded-(--radius-lg) bg-(--color-surface) p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold">{nickname}</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-(--color-text-muted)">✕</button>
        </div>
        {/* GG-POST-008/009 메이트지수·채팅신청 placeholder (슬라이스 4/5) */}
        <div className="mb-3 flex items-center justify-between text-[13px]">
          <span className="text-(--color-text-muted)">메이트 지수</span>
          <span className="text-(--color-text-muted)">준비 중</span>
        </div>
        <button type="button" disabled className="w-full rounded-(--radius-md) border border-(--color-border) px-3 py-2 text-[13px] text-(--color-text-muted) opacity-60" title="준비 중">
          채팅 신청하기
        </button>
      </div>
    </div>
  );
}
```
- [ ] **`parts/CommentComposer.tsx`** (댓글/대댓글 작성, controlled):
```tsx
import { useState } from 'react';
import { createComment, type CommentNode } from '../../../lib/api/posts.js';

export function CommentComposer({ postId, parentCommentId, onCreated, onCancel }: {
  postId: string; parentCommentId?: string; onCreated: (c: CommentNode) => void; onCancel?: () => void;
}) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    const t = text.trim();
    if (t.length < 1) return;
    setPending(true);
    try {
      const c = await createComment(postId, parentCommentId ? { body: t, parentCommentId } : { body: t });
      setText('');
      onCreated(c);
    } catch (e) {
      if ((e as Error).message === 'REPLY_TO_REPLY_NOT_ALLOWED') alert('대댓글에는 답글을 달 수 없어요.');
      else if ((e as Error).message === 'UNAUTHENTICATED') alert('로그인이 필요해요.');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={parentCommentId ? '답글을 입력하세요' : '댓글을 입력하세요'}
        className="min-w-0 flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-[14px]"
      />
      <button type="button" onClick={submit} disabled={pending} className="rounded-(--radius-md) bg-(--color-accent) px-3 py-2 text-[13px] text-white disabled:opacity-60">등록</button>
      {onCancel && <button type="button" onClick={onCancel} className="text-[13px] text-(--color-text-muted)">취소</button>}
    </div>
  );
}
```
- [ ] **`parts/CommentTree.tsx`** (댓글+대댓글 1단계 + 본인 수정·삭제 + 작성자 클릭 모달. **대댓글(isReply=true)에는 답글 버튼 없음 — GG-POST-003 의 UI 측 강제**):
```tsx
import { useState } from 'react';
import type { CommentNode } from '../../../lib/api/posts.js';
import { deleteComment, updateComment } from '../../../lib/api/posts.js';
import { CommentComposer } from './CommentComposer.js';

function CommentItem({ node, postId, isReply, onAuthorClick, onChanged }: {
  node: CommentNode; postId: string; isReply: boolean;
  onAuthorClick: (nickname: string) => void; onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(node.body);

  const saveEdit = async () => {
    const t = editText.trim();
    if (t.length < 1) return;
    await updateComment(node.commentId, { body: t });
    setEditing(false);
    onChanged();
  };
  const remove = async () => {
    if (!confirm('삭제할까요?')) return;
    await deleteComment(node.commentId);
    onChanged();
  };

  return (
    <li className={isReply ? 'ml-6 border-l border-(--color-border) pl-3' : ''}>
      <div className="py-2">
        <div className="mb-1 flex items-center gap-2 text-[12px] text-(--color-text-muted)">
          <button type="button" onClick={() => onAuthorClick(node.authorNickname)} className="font-medium text-(--color-text) hover:underline">
            {node.authorNickname}
          </button>
          <span>{new Date(node.createdAt).toLocaleDateString()}</span>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <input value={editText} onChange={(e) => setEditText(e.target.value)} className="min-w-0 flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 py-1 text-[14px]" />
            <button type="button" onClick={saveEdit} className="text-[13px] text-(--color-accent)">저장</button>
            <button type="button" onClick={() => setEditing(false)} className="text-[13px] text-(--color-text-muted)">취소</button>
          </div>
        ) : (
          <p className="text-[14px]">{node.body}</p>
        )}
        <div className="mt-1 flex gap-3 text-[12px] text-(--color-text-muted)">
          {/* GG-POST-003: 대댓글(isReply)에는 답글 버튼 미노출 — depth 1 강제 (서버 422 와 이중 방어). */}
          {!isReply && <button type="button" onClick={() => setReplying((v) => !v)}>답글</button>}
          {node.isMine && !editing && <button type="button" onClick={() => setEditing(true)}>수정</button>}
          {node.isMine && <button type="button" onClick={remove}>삭제</button>}
        </div>
        {replying && (
          <div className="mt-2">
            <CommentComposer postId={postId} parentCommentId={node.commentId} onCreated={() => { setReplying(false); onChanged(); }} onCancel={() => setReplying(false)} />
          </div>
        )}
      </div>
      {node.replies.length > 0 && (
        <ul>
          {node.replies.map((r) => (
            <CommentItem key={r.commentId} node={r} postId={postId} isReply onAuthorClick={onAuthorClick} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CommentTree({ comments, postId, onAuthorClick, onChanged }: {
  comments: CommentNode[]; postId: string; onAuthorClick: (nickname: string) => void; onChanged: () => void;
}) {
  if (comments.length === 0) return <p className="py-4 text-[13px] text-(--color-text-muted)">첫 댓글을 남겨보세요.</p>;
  return (
    <ul className="divide-y divide-(--color-border)">
      {comments.map((c) => (
        <CommentItem key={c.commentId} node={c} postId={postId} isReply={false} onAuthorClick={onAuthorClick} onChanged={onChanged} />
      ))}
    </ul>
  );
}
```
- [ ] **`index.tsx`** (상세 fetch + 좋아요 + 본인 글 수정[ComposeModal edit 모드]·삭제 + 댓글. **수정은 별도 `/edit` 라우트 없이 `editOpen` state + `<ComposeModal editPost=.../>` 로 처리 — navigate(.../edit) 잔재 없음**):
```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CommunityShell, CATEGORY_LABELS } from '../CommunityPage/parts/CommunityShell.js';
import { MateRecoPlaceholder } from '../CommunityPage/parts/MateRecoPlaceholder.js';
import { ComposeModal } from '../CommunityPage/parts/ComposeModal.js';
import { CommentTree } from './parts/CommentTree.js';
import { CommentComposer } from './parts/CommentComposer.js';
import { AuthorProfileModal } from './parts/AuthorProfileModal.js';
import { fetchPostDetail, togglePostLike, deletePost, type PostDetail } from '../../lib/api/posts.js';
import { useCurrentUser } from '../../lib/auth-context';

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [error, setError] = useState<'NOT_FOUND' | 'ERROR' | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalNick, setModalNick] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const reload = useCallback((signal?: AbortSignal) => {
    if (!id) return;
    fetchPostDetail(id, signal)
      .then((d) => { setDetail(d); setLoading(false); })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message === 'NOT_FOUND' ? 'NOT_FOUND' : 'ERROR');
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort(); // cleanup.
  }, [reload]);

  const onLike = async () => {
    if (!detail) return;
    try {
      const r = await togglePostLike(detail.postId);
      setDetail({ ...detail, liked: r.liked, likeCount: r.likeCount });
    } catch (e) {
      if ((e as Error).message === 'UNAUTHENTICATED') alert('로그인이 필요해요.');
    }
  };
  const onDeletePost = async () => {
    if (!detail || !confirm('게시글을 삭제할까요?')) return;
    await deletePost(detail.postId);
    navigate('/community');
  };

  return (
    <CommunityShell rightRail={<MateRecoPlaceholder />}>
      {loading && <div className="py-12 text-center text-(--color-text-muted)">불러오는 중…</div>}
      {error === 'NOT_FOUND' && <div className="py-12 text-center text-(--color-text-muted)">존재하지 않거나 만료된 게시글이에요.</div>}
      {error === 'ERROR' && <div className="py-12 text-center text-(--color-text-muted)">불러오지 못했어요.</div>}
      {detail && (
        <article className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-5">
          <span className="mb-2 inline-block rounded-(--radius-sm) bg-(--color-bg) px-2 py-0.5 text-[11px] text-(--color-text-muted)">
            {CATEGORY_LABELS[detail.category] ?? detail.category}
          </span>
          <h1 className="mb-1 text-(length:--text-h2) font-semibold">{detail.title}</h1>
          <div className="mb-4 flex items-center gap-2 text-[12px] text-(--color-text-muted)">
            {/* GG-POST-008 작성자 닉네임 클릭 → 프로필 모달 */}
            <button type="button" onClick={() => setModalNick(detail.authorNickname)} className="font-medium text-(--color-text) hover:underline">
              {detail.authorNickname}
            </button>
            <span>{new Date(detail.createdAt).toLocaleDateString()}</span>
          </div>
          <p className="mb-5 whitespace-pre-wrap text-[15px] leading-relaxed">{detail.body}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onLike} className={`rounded-(--radius-md) border px-3 py-1.5 text-[13px] ${detail.liked ? 'border-(--color-accent) text-(--color-accent)' : 'border-(--color-border)'}`}>
              ♥ {detail.likeCount}
            </button>
            {detail.isMine && (
              <>
                {/* GG-POST-004 수정 — 별도 /edit 라우트 없이 ComposeModal edit 모드 재사용 (YAGNI). */}
                <button type="button" onClick={() => setEditOpen(true)} className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px]">수정</button>
                {/* GG-POST-005 삭제 */}
                <button type="button" onClick={onDeletePost} className="rounded-(--radius-md) border border-(--color-border) px-3 py-1.5 text-[13px]">삭제</button>
              </>
            )}
          </div>

          <section className="mt-6 border-t border-(--color-border) pt-4">
            <h2 className="mb-3 text-[15px] font-semibold">댓글</h2>
            {user && <div className="mb-4"><CommentComposer postId={detail.postId} onCreated={() => reload()} /></div>}
            <CommentTree comments={detail.comments} postId={detail.postId} onAuthorClick={setModalNick} onChanged={() => reload()} />
          </section>
        </article>
      )}
      {modalNick && <AuthorProfileModal nickname={modalNick} onClose={() => setModalNick(null)} />}
      {editOpen && detail && (
        <ComposeModal
          editPost={detail}
          onClose={() => setEditOpen(false)}
          onCreated={() => { setEditOpen(false); reload(); }}
        />
      )}
    </CommunityShell>
  );
}
```
> **수정 흐름(단일 진실).** 코드 본문이 이미 `editOpen` state + `<ComposeModal editPost={detail} .../>` 로 완성형이다. `navigate(.../edit)` 같은 죽은 라우트는 없으며, `/community/posts/:id/edit` 라우트도 만들지 않는다(YAGNI). 코드와 지시가 일치 — 별도 "대체하라" 산문 없음.
- [ ] **green 확인:** `cd apps/web && npm run typecheck && npm run build` → 에러 0.
- [ ] **commit:** `feat(web): 게시글 상세 A_802 — 본문/댓글/대댓글/좋아요/프로필모달/수정모달 (GG-COMM-005, GG-POST-001~009)`

---

## Task 8 — 회귀 + 그래프 갱신 + 슬라이스 마감

**Files:** (검증 전용 + docs)

- [ ] **BFF 회귀:** `cd apps/bff && npm run community:eval` → `13/13 passed`, 종료코드 0(서버 미기동, Postgres 만). 기존 `npm run chat:eval` 은 스키마 추가만 했으므로 무영향 — 단, chat:eval 은 BFF dev 서버 기동 전제이므로 이번 회귀에서 **선택**(스키마 변경이 기존 모델 불변임을 `npm run build` 로 갈음 확인).
- [ ] **BFF/Web 빌드:** `cd apps/bff && npm run build` + `cd apps/web && npm run build` → 둘 다 에러 0. (Header import 경로가 `../../../layout/Header` 로 정정되어 모듈 해석 성공 — green 게이트 성립.)
- [ ] **수동 E2E (선택, dev 서버 — 미들웨어·쿠키 경유 풀스택 확인):** BFF+Web 기동(`apps/bff: npm run dev`, `apps/web: npm run dev`) 후 dev-login 으로 세션 생성 → 아래 순서로 명시 확인:
  1. `/me` 진입 → 우측 상단 **커뮤니티** 버튼 클릭 → `/community` 이동(GG-MY-006).
  2. 카테고리 `전체/축제이야기/메이트찾기/자유게시판` 전환 시 목록 갱신(GG-COMM-003/004).
  3. **글쓰기** → ComposeModal → 등록 → 목록 최상단 노출. (비로그인 상태에서는 글쓰기 버튼이 `disabled`+title 인지 확인.)
  4. 목록 카드 클릭 → 상세 진입(GG-COMM-005).
  5. 상세에서 **댓글** 작성 → 그 댓글에 **답글**(대댓글) 작성 → 새로고침. **대댓글 아래에는 `답글` 버튼이 없고**(CommentItem `isReply=true` 분기), **상위 댓글에는 `답글` 버튼이 보이는지** 확인(GG-POST-003).
  6. **좋아요** 토글 → ♥ 카운트 1↔0, 버튼 색 변화.
  7. 본인 글 **수정**(ComposeModal edit 모드 — 카테고리 셀렉터 없음, 제목/본문만) 저장 → 반영. **삭제** → `/community` 로 이동, 목록에서 사라짐(GG-POST-004/005).
- [ ] **그래프 갱신** (CLAUDE.md 규칙 — 코드 수정 세션이므로 필수):
  - 명령: `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`
- [ ] **docs 커밋:** `docs(plans): 슬라이스1 커뮤니티 셸+게시판 구현 완료 메모`. 기록 항목:
  - 후속 이관 placeholder: 크레딧 실값(슬라이스 6), 언어토글/i18n/게시글 번역(슬라이스 7), 채팅방 이동(슬라이스 5), 메이트 추천/신청·메이트지수·채팅신청(슬라이스 3~5).
  - **메이트찾기(mate_finder) 게시판의 작성자→댓글자 1:1 신청(GG-MATE-007/008, ADR 결정 12 단서)은 후속 슬라이스 이관 — 이 슬라이스에는 진입점 placeholder 미배치**(매칭 도메인 모델 부재).
  - ADR 0007 결정 10 보정(게시글 만료=쿼리필터)은 Task 1 에서 ADR 본문에 반영 완료.
  - 목록 카드 `liked` 미포함은 의도된 단순화 — 카드 하트 채움 필요 시 `listPosts` 사용자 like 조인 확장 필요.

---

## 규율 체크 (DRY / YAGNI / 컨벤션)

- **DRY:** `parseIntClamp`/`parseBigId`/`CATEGORIES`/`POST_TTL_MS`/`CommentNodeOut` 는 `posts.ts` 내 단일 정의(bookmarks.ts 의 private `parseIntClamp` 는 export 안 되어 재사용 불가 → 자체 정의가 정당). `CommunityShell`·`MateRecoPlaceholder`·`CATEGORY_LABELS` 는 목록/상세 양쪽 공유. ComposeModal 은 생성+수정 겸용(중복 폼 금지).
- **YAGNI:** 게시글 만료는 컬럼+쿼리 필터(스케줄러·크론 미도입, ADR 0007 보정 반영). 카테고리 마스터 테이블 없음(고정 3종 CHECK). 게시글 사진 첨부·무한스크롤·실 i18n·메이트 연동·`/edit` 별도 라우트는 범위 밖. 목록 `liked` 미포함.
- **컨벤션 준수:** enum = `String @db.VarChar` + 마이그레이션 SQL CHECK. BigInt ID 직렬화 시 `.toString()`. 게이트 = `requireAuth`(작성/수정/삭제/좋아요/댓글) + `resolveAuth`(상세 공개+개인화 liked/isMine). 트랜잭션 내 집계는 `tx`, 좋아요 응답은 **in-tx count**(밖 재count 없음). P2002 멱등 안전망(좋아요). 마이그레이션 `YYYYMMDDHHMMSS_`. Conventional Commits + 잦은 커밋. LLM 미사용(검증 = 구조적 assertion only, 금지 #4). web fetch 는 `withCredentials`, useEffect 는 AbortController cleanup, 색/간격은 CSS 변수만. import 확장자 = 페이지/layout/components/auth-context 는 무확장, parts·lib/api 는 `.js`(기존 컨벤션 일치). Header = `layout/Header`(존재 확인).
- **트레이서빌리티(요구 ID 정정):** 마이페이지→커뮤니티 진입 = **GG-MY-006**(GG-COMM-001 아님). 커뮤니티 페이지 자체 진입/구성 = GG-COMM-001~004/006. 게시글 상세 진입 = **GG-COMM-005**(PostList Link + 상세 라우트). 만료 비노출 = GG-POST-010/011/012(Task 2 회귀 케이스로 잠금). depth1 = GG-POST-003(서버 422 + UI 답글버튼 미노출 이중 방어).

**후속 슬라이스로 명시 이관:** 크레딧 실값(6), 언어토글/번역(7), 채팅방 이동(5), 메이트 추천·신청·메이트지수·채팅신청·메이트찾기 1:1 신청 진입점(3~5), 타임아웃 스케줄러 본체(ADR 결정 10, 후속).