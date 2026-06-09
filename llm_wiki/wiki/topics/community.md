---
title: 커뮤니티 (게시판)
type: topic
created: 2026-06-09
updated: 2026-06-09
related:
  - reports-blocking-moderation.md
  - mate-matching.md
  - db-schema-overview.md
  - roles-and-active-role.md
  - use-cases-index.md
---

# 커뮤니티 (게시판)

## Summary

Phase 2(ADR 0007) 소셜 레이어의 게시판 모듈(A_800/A_802). 카테고리 3종(`festival_story` 축제이야기 / `mate_finder` 메이트찾기 / `free` 자유게시판) + 전체 보기. 게시글/댓글/대댓글(1단계)/좋아요(하트) CRUD, 본인 글·댓글 수정·삭제, **게시글 7일 만료(비노출, 데이터 보관)**. 라우트 핸들러는 전부 `apps/bff/src/routes/posts.ts` 단일 파일에 함수 단위로 정의되고 `apps/bff/src/app.ts` 에서 `/community/*` 로 와이어링된다. 대상 액터는 일반 사용자(일반 로그인). 모더레이션(신고·차단)은 별도 모듈로 위임된다 → [reports-blocking-moderation.md](reports-blocking-moderation.md).

## 데이터 모델 (`apps/bff/prisma/schema.prisma`)

### `Post` (`posts`)
- `postId` BigInt PK (autoincrement)
- `userId` BigInt — 작성자 FK
- `category` VarChar(20) — `festival_story | mate_finder | free` 고정 3종. **마스터 테이블 없음**, CHECK 제약은 마이그레이션 SQL 에. 라우트는 `CATEGORIES` Set 으로 검증.
- `title` VarChar(200), `body` Text
- `likeCount` Int @default(0), `commentCount` Int @default(0) — **비정규화 캐시** (좋아요/댓글 변경 시 재집계해 덮어씀)
- `expiresAt` Timestamptz — 작성 후 7일. 조회 시 `expiresAt > now()` 필터로 비노출(GG-POST-010/011/012)
- `isDeleted` Boolean, `deletedAt` Timestamptz? — soft-delete
- `createdAt` / `updatedAt`
- 인덱스: `idx_posts_category_active` (`category, expiresAt, createdAt DESC`), `idx_posts_user`

### `Comment` (`comments`) — 자기참조, 대댓글 1단계만
- `commentId` BigInt PK, `postId` BigInt FK(onDelete Cascade), `userId` BigInt FK
- `parentCommentId` BigInt? — **NULL = 최상위, 값 있으면 대댓글**. depth 1 강제는 라우트에서 검증(GG-POST-003)
- `body` Text, `isDeleted` / `deletedAt`, `createdAt` / `updatedAt`
- self-relation `CommentReplies` (parent/replies)
- 인덱스: `idx_comments_post` (`postId, createdAt`), `idx_comments_parent`, `idx_comments_user`

### `PostLike` (`post_likes`) — 좋아요/하트 토글
- `postLikeId` BigInt PK, `postId` BigInt FK(Cascade), `userId` BigInt FK, `createdAt`
- `@@unique([postId, userId])` → `uq_post_like` (1인 1좋아요 보장 + 토글 멱등 안전망)

## 게시글 만료(TTL) 동작

- 상수: `POST_TTL_MS = 7 * 24 * 60 * 60 * 1000` (= 7일) — `apps/bff/src/routes/posts.ts:8`, 주석 태그 `GG-POST-010`.
- 생성 시 `expiresAt = new Date(Date.now() + POST_TTL_MS)`.
- **스케줄러 없음.** ADR 0007 결정10의 게시글 7일 타임아웃은 슬라이스1 보정(2026-05-30)에서 **조회 시점 쿼리 필터(`expiresAt: { gt: new Date() }`)** 로 구현하기로 변경됨(YAGNI). 다른 메이트 타임아웃(1:1 24h, 그룹 6h, 강퇴 36h, 약속 36h)만 스케줄러 본체로 도입.
- 만료 = **비노출이지 삭제 아님**(GG-POST-012). list / detail / comment-create / update / like 모든 읽기·쓰기 경로가 `expiresAt > now()` 를 WHERE 에 동봉 → 만료 글은 목록 누락 + 상세 404, 종속 댓글·대댓글도 동반 비노출. (단 `deletePost` 의 존재 확인 쿼리는 만료 필터를 빼서 만료 후에도 본인 삭제 가능.)

## CRUD + 좋아요 흐름 (route paths / methods)

| Method | Path | 핸들러 | 인증 |
|---|---|---|---|
| GET | `/community/posts?category=&page=&limit=` | `listPosts` | 없음 |
| GET | `/community/posts/:id` | `getPostDetail` | `resolveAuth`(선택) |
| POST | `/community/posts` | `createPost` | requireAuth + requireNotSuspended |
| PATCH | `/community/posts/:id` | `updatePost` | requireAuth + requireNotSuspended |
| DELETE | `/community/posts/:id` | `deletePost` | requireAuth |
| POST | `/community/posts/:id/like` | `toggleLike` | requireAuth + requireNotSuspended |
| POST | `/community/posts/:id/comments` | `createComment` | requireAuth + requireNotSuspended |
| PATCH | `/community/comments/:id` | `updateComment` | requireAuth + requireNotSuspended |
| DELETE | `/community/comments/:id` | `deleteComment` | requireAuth |
| POST | `/community/posts/:id/translate` | `translatePost` (`routes/translate.ts`) | resolveAuth(비로그인 가능) |

- **list**: `isDeleted=false AND expiresAt>now` (+카테고리), `ORDER BY createdAt DESC, postId DESC`, page/limit clamp(limit 1~100, default 20). 응답에 작성자 nickname·likeCount·commentCount.
- **detail**: 댓글을 `createdAt ASC` 로 flat 조회 후 BFF 에서 **트리(부모→replies) 재구성**. `auth` 있으면 `PostLike.count` 로 `liked`, 작성자 비교로 `isMine` 채움.
- **toggleLike**: 단일 `$transaction` 안에서 `deleteMany` → `del.count===0` 이면 create(P2002 경합은 멱등 무시) → `PostLike.count` 재집계 → `post.likeCount` 갱신. 응답 `{liked, likeCount}` 는 트랜잭션 내부 계산값(DB-응답 정합).
- **createComment**: 부모 지정 시 같은 postId 소속 확인(cross-post parent 방어), 부모가 이미 대댓글이면 422 `reply_to_reply_not_allowed`. 트랜잭션에서 생성 후 `commentCount` 재집계.
- 입력 검증: title 2~200자, post body 2~5000자, comment body 1~1000자.

## 권한 / role 게이팅

- **읽기**(list/detail/translate)는 비로그인 허용. detail·translate 는 `resolveAuth` 로 토큰이 있으면 개인화(liked/isMine), 없으면 익명.
- **쓰기**(글/댓글 생성·수정·좋아요)는 `requireAuth` + `requireNotSuspended` 필수. 정지(suspended) 사용자는 쓰기 전면 차단.
- **소유권**: updatePost/deletePost/updateComment/deleteComment 는 `existing.userId !== auth.userId` 면 403 `forbidden`. 게시글 수정 시 **category 변경 불가**(title·body 만).
- `active_role` 별 분기는 없음 — 게시판은 일반 사용자 공통 기능. 관리자 모더레이션은 본 모듈이 아닌 신고 처리(A_701)에서. ([roles-and-active-role.md](roles-and-active-role.md))
- 삭제는 모두 **soft-delete**(`isDeleted=true`, `deletedAt`). 게시글 soft-delete 시 자식 댓글은 살아있되 detail 이 404 → 동반 비노출.

## 모더레이션 훅

- 게시판 자체에는 신고·차단 로직이 없다. CLAUDE.md 금지 #4(관리자 판단 비위임)·ADR 0007 결정13에 따라 모더레이션은 **신고 접수 → 관리자 검토 → 조치(경고/정지/허위신고)** 흐름으로 분리됨(A_701). 차단된 사용자는 추천/신청/채팅 상호작용에서 제외(GG-REPORT-009).
- 게시판 쓰기 차단의 접점은 `requireNotSuspended` 미들웨어 — 관리자 제재로 suspended 가 된 사용자는 글/댓글/좋아요가 막힌다. 상세는 [reports-blocking-moderation.md](reports-blocking-moderation.md).
- 메이트찾기 게시판(`mate_finder`)은 작성자가 댓글자 중 1명에게 1:1 메이트 신청을 거는 진입점(GG-MATE-007/008) → [mate-matching.md](mate-matching.md).

## 평가 하네스 (`apps/bff/src/jobs/community-eval.ts`)

실 HTTP 서버·세션 없이 라우트 핸들러를 직접 호출하는 경량 통합 테스트. `mockReq`/`mockRes` 로 `req.auth` 를 주입하고 `res.status/json` 캡처값을 검증. 실 DB 의 첫 비삭제 user 1명을 픽스처로 사용하고 finally 에서 생성 글을 정리. 커버 케이스:

- `post.create.ok` / `post.create.bad_category`(400)
- `post.list.free`(페이지네이션 필드 + 방금 글 포함)
- `post.detail.isMine`(작성자 isMine=true, liked=false) / `post.detail.404`
- `post.expired.hidden` — `expiresAt` 을 과거로 갱신 → 목록 누락 + 상세 404, 후 복구
- `comment.create.ok`(root parent null) / `comment.create.commentCount`(=1) / `comment.update.ok` / `comment.update.forbidden`(403)
- `comment.reply.ok`(대댓글 1단계) / `comment.reply.depth2_blocked`(422) / `comment.delete.excluded`(트리 제외)
- `post.update.ok` / `post.update.forbidden`(403) / `post.delete.forbidden`(403)
- `post.like.toggle`(on liked/count 1 → off liked/count 0) / `post.delete.then404`

실행 결과는 `PASS/FAIL <id>` 라인 + `N/M passed` 요약, 실패 시 exit 1.

## UI (`apps/web/src/pages/`)

- `CommunityPage/` — A_800 진입(`/community`). SEG 카테고리 탭(전체+3종), 카테고리 전환 시 AbortController 로 이전 요청 취소. 글쓰기 버튼은 비로그인 시 disabled + aria 로그인 유도(숨김 대신 노출, 서버 requireAuth 가 최종 차단).
- `PostDetailPage/` — 상세 + 댓글/대댓글 트리, 좋아요 토글, 번역(GG-COMM-013).

## References

- `apps/bff/src/routes/posts.ts` — 게시판 라우트 핸들러 본체 (`POST_TTL_MS` 상수 포함)
- `apps/bff/src/app.ts` (L260~312) — `/community/*` 라우트 와이어링 + 미들웨어 체인
- `apps/bff/prisma/schema.prisma` (L640~706) — `Post` / `Comment` / `PostLike` 모델
- `apps/bff/src/jobs/community-eval.ts` — 평가 하네스
- `apps/bff/src/routes/translate.ts` — 게시글 번역(GG-COMM-013)
- `docs/decisions/0007-phase2-community-mate-matching.md` — 결정10(만료 보정)·12(게시판)·13(모더레이션)
- `apps/web/src/pages/CommunityPage/`, `apps/web/src/pages/PostDetailPage/` — 프론트
