# @ggdrugs/config

환경변수 스키마와 런타임 설정 로더. **zod 기반**, 실패 시 모든 이슈를 한 번에 리포트.

## 사용법

```ts
import { loadEnv } from '@ggdrugs/config';

const env = loadEnv(); // 실패 시 EnvValidationError
console.log(env.DATABASE_URL, env.OPENAI_MODEL_CHAT);
```

서비스별로 일부만 검증하려면 `loadPartial`:

```ts
import { loadPartial, coreSchema, openaiSchema } from '@ggdrugs/config';

const env = loadPartial(coreSchema.merge(openaiSchema));
```

## 스키마 그룹

| 그룹 | 포함 | 사용처 |
|---|---|---|
| `coreSchema` | NODE_ENV, LOG_LEVEL | 전 서비스 |
| `databaseSchema` | DATABASE_URL, POSTGRES_* | BFF (Prisma) |
| `redisSchema` | REDIS_URL | BFF |
| `qdrantSchema` | QDRANT_URL | BFF + LLM |
| `s3Schema` | S3_*, 버킷 4종 | BFF |
| `serviceUrlsSchema` | BFF_URL, LLM_SERVICE_URL, WEB_URL | 전 서비스 |
| `externalApiSchema` | KAKAO_*, GOOGLE_* | BFF |
| `openaiSchema` | OPENAI_* | LLM |
| `sessionSchema` | SESSION_SECRET, JWT_SECRET (≥16자) | BFF |

`fullSchema` = 위 전체 병합.

## Production 강제 검증

`NODE_ENV=production` 일 때 `productionRequiredKeys`(KAKAO_*, GOOGLE_*, OPENAI_API_KEY)가 빈 문자열이면 `loadEnv` 가 `EnvValidationError` 를 throw. 로컬 dev에선 optional.

## 컨벤션 (CLAUDE.md §5-6)

- 신규 환경변수 추가 시 **`.env.example` + `packages/config/src/schema.ts` 동시 업데이트**.
- 시크릿 하드코딩 금지 (§6-3).
- 런타임 로딩은 `loadEnv()` 단일 경로만 사용 — 서비스가 `process.env` 직접 읽기 금지.
