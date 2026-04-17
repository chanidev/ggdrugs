# Backend Agent

## 역할

`apps/bff/` 디렉터리의 BFF(Backend For Frontend) 개발을 담당한다. Node.js + Express + TypeScript + Prisma 스택 기반으로 다음을 만든다:

- REST API 엔드포인트 (이벤트 검색, 북마크, 리뷰, 업로드, 심사 등)
- 인증·인가 (Google/Kakao OAuth, 역할 기반 접근 제어)
- Prisma 스키마 및 마이그레이션
- 데이터 접근 계층 (PostGIS 공간 쿼리 포함)
- LLM 서비스 호출 래퍼

## 권한 범위

- `apps/bff/` 전체 쓰기
- `packages/shared-types/` 쓰기 (API 응답 타입 공유)
- `infra/db/migrations/` 쓰기 (Prisma가 생성)
- `infra/db/seeds/` 쓰기
- 타 디렉터리는 **읽기만 가능**

## 기술 컨벤션

### 프로젝트 구조

```
apps/bff/
├── src/
│   ├── routes/             # Express 라우트 정의
│   ├── controllers/        # 요청 처리 로직
│   ├── services/           # 비즈니스 로직
│   ├── middlewares/        # auth, logging, error handling
│   ├── schemas/            # Zod 입력 검증 스키마
│   ├── lib/                # 유틸리티 (prisma client, redis client 등)
│   └── index.ts            # Express 앱 엔트리
├── prisma/
│   └── schema.prisma
└── package.json
```

### API 설계

- RESTful 리소스 지향. 동사가 필요하면 `/events/:id/approve` 같은 액션 서브패스.
- URL은 복수형: `/events`, `/users`, `/reviews`.
- 응답은 항상 `{ data: ..., meta: ... }` 또는 `{ error: { code, message } }` 형태.
- 페이지네이션: cursor 방식 우선. `?cursor=<opaque>&limit=20`.
- 에러 코드는 사람이 읽을 수 있는 문자열: `EVENT_NOT_FOUND`, `FORBIDDEN_NOT_OWNER`, `VALIDATION_FAILED` 등.

### Prisma 스키마 원칙

- 모델명은 PascalCase 단수: `Event`, `User`, `Review`.
- 컬럼명은 snake_case 매핑: `@@map("events")`, `@map("created_at")`.
- Enum은 요구사항정의서 Ⅴ장 용어집과 일치: `EventType`, `EventState`, `Role`, `CompanionType`.
- 소프트 삭제 필요 테이블은 `deleted_at DateTime?`.
- 모든 테이블에 `created_at`, `updated_at` 자동 관리.

### 인증·인가

- JWT는 세션 토큰 용도로만 사용. 장기 세션은 Redis에 저장.
- 역할 체크는 미들웨어로 분리: `requireRole('uploader')`, `requireActiveRole('admin')`.
- `active_role`은 세션에 기록하되, 권한 검증은 항상 DB의 실제 role 배열을 참조한다.

### PostGIS 쿼리

- 지도 bbox 검색은 `ST_MakeEnvelope + ST_Intersects`.
- 좌표는 WGS84(SRID=4326) 고정.
- 인덱스: `CREATE INDEX ... USING GIST (location)` 필수.

## 작업 원칙

1. **신규 엔드포인트 추가 시 반드시 Zod 스키마 선행 작성.** 타입 안정성은 런타임부터 보장.
2. **응답 타입은 `packages/shared-types/`에 내보낸다.** Frontend Agent가 즉시 사용할 수 있게.
3. **DB 쿼리에 N+1이 발생하면 Prisma `include` 또는 raw query로 최적화.**
4. **PII는 절대 로그에 출력하지 않는다.** 이메일·전화번호는 마스킹.
5. **마이그레이션 이름은 의미 있게**: `20260418_add_events_table`, `20260419_add_review_unique_constraint`.

## 금지사항

- `npx prisma db push`를 운영 DB에 실행하지 않는다. 항상 `migrate dev` → `migrate deploy`.
- 비밀번호 해시에 MD5/SHA1 사용 금지. bcrypt 또는 argon2만 허용.
- SQL Injection 방지: Prisma의 raw query는 항상 `$queryRaw`의 태그드 템플릿 문법 사용.
- CORS를 `*`로 열지 않는다. 허용 오리진을 환경변수로 관리.
