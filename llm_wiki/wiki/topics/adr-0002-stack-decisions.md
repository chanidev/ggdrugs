---
title: ADR 0002 — 기술 스택 결정 (오브젝트 스토리지·LLM 공급자·벡터 저장소)
type: topic
created: 2026-04-17
updated: 2026-04-17
sources: [2026-04-17_requirements-v5]
related:
  - tech-stack.md
  - db-schema-overview.md
  - adr-0001-terminology-reconciliation.md
---

# ADR 0002 — 기술 스택 결정

**상태**: Accepted (2026-04-17) · **원문**: [`docs/decisions/0002-stack-decisions.md`](../../../docs/decisions/0002-stack-decisions.md)

## Summary

ADR 0001로 DB 정합성은 해소되었으나 Phase 1 진입 전 남아있던 인프라 공백 3건(오브젝트 스토리지·LLM 공급자·벡터 저장소)을 확정. **MinIO 단일 / OpenAI 단일 / Qdrant 단일**로 결정하여 공급자 수를 최소화하고 Phase 0~1 운영 오버헤드를 줄인다. 프로덕션 전환 시 MinIO는 S3/Naver Cloud로 endpoint 교체만으로 마이그레이션 가능.

## 확정 결정 (3건)

| # | 항목 | 확정 | 근거 |
|---|---|---|---|
| D-1 | 오브젝트 스토리지 | **MinIO (S3 호환 자체호스팅)** — `minio/minio:RELEASE.2024-12-18T13-15-44Z`. 버킷 4개: `ggdrugs-approval-docs` / `-review-photos` / `-event-posters` / `-user-photos` | Phase 0~1 비용·계정 오버헤드 0. S3 호환이라 endpoint만 교체하면 프로덕션(AWS S3 ap-northeast-2 또는 Naver Cloud) 전환 가능 |
| D-2 | LLM 공급자 | **OpenAI 단일** — `gpt-4o`(채팅 A_201), `gpt-4o-mini`(감성분석·태깅·경량 분류), `text-embedding-3-small`(임베딩 1536차원) | 키·SDK·과금 콘솔 1개로 운영 단순화. 임베딩 비용 효율 양호(1M 토큰당 $0.02 수준) |
| D-3 | 벡터 저장소 | **Qdrant 단일** (`v1.9.0` → `v1.13.0` 업그레이드). **pgvector 미도입** (DDL 말미 주석 제거) | 단일 벡터 스토어로 재인덱싱·모니터링 단순화. payload 필터·하이브리드 검색에서 pgvector 대비 우위. Postgres는 관계형·트랜잭션에 집중 |

## Key points

### 즉시 반영 완료 (Phase 0 산출물)
- [x] `docker-compose.yml` — `minio` 서비스 추가 (S3 API 9000 / 콘솔 9001), Qdrant 이미지 버전 업그레이드.
- [x] `.env.example` — MinIO · OpenAI · 버킷 이름 환경변수 정리. **ANTHROPIC 키 제거**.
- [x] [db-schema-overview.md](db-schema-overview.md) §extensions 섹션에서 pgvector 제거.
- [x] [tech-stack.md](tech-stack.md) 확정본 페이지 신규 작성.

### Phase 1 착수 시 구현 항목
- [ ] `apps/bff/` — MinIO 연동 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`). 첫 부팅 시 `ensureBucket` 로직으로 버킷 4개 자동 생성.
- [ ] `services/llm/` — OpenAI 클라이언트 초기화 + 임베딩·채팅·감성분석 어댑터.
- [ ] `services/llm/` — Qdrant 컬렉션 스키마 (이벤트 / 기사 / 리뷰 3종 예상).
- [ ] `packages/config/` — zod 스키마에 MinIO·OpenAI 환경변수 검증 추가.

### 고려했으나 보류한 대안
- **Anthropic Claude** — 한국어 자연스러움 우위이나 임베딩 미제공 → OpenAI 또는 Voyage 병행 필요 → 이중 공급자 관리 부담.
- **BGE-M3 자체호스팅** — 한국어 임베딩 품질 최상이나 GPU 인프라 필요 → Phase 0~1 규모 대비 과잉.
- **pgvector 단일** — 트랜잭션 일관성은 이점이나 유사도 쿼리가 Postgres CPU 잠식 위험.
- **Qdrant + pgvector 이중 운용** — 동일 임베딩 이중 관리 오버엔지니어링.

### 재평가 트리거
- **LLM 공급자 재평가**: 한국어 품질 불만 누적 또는 월 OpenAI 비용이 예산 초과 시 Anthropic 혼합·전환 검토. `services/llm/` 설계 시 **공급자 추상화 레이어** 전제.
- **스토리지 마이그레이션**: 운영 규모가 커지면 Phase 4+ 에 MinIO → AWS S3 / Naver Cloud로 전환. `.env`의 `S3_ENDPOINT` 교체만.

## Open questions / contradictions

1. MinIO 데이터는 개발 환경에서 `minio_data` named volume — 휘발성 간주. 시드 업로드 복구 정책 미정.
2. OpenAI API 키 조직 계정 발급 대기 (개인 키 지양, 비용 추적 목적). Phase 1 착수 전 확보 필요.
3. Qdrant 컬렉션 분리 기준 — 이벤트/기사/리뷰를 3컬렉션 vs 단일 컬렉션 + payload 구분 중 택1. Phase 1 구현 시 프로파일링 후 결정.
4. `services/llm/` ↔ BFF DB write 책임 분담 — LLM 서비스가 `chat_messages`·`search_logs`를 직접 write할지, BFF API 경유할지 (tech-stack.md Open question #1과 동일 이슈).

## References

- [원문 ADR 0002](../../../docs/decisions/0002-stack-decisions.md) — §2 Decisions D-1~D-3, §3 Consequences, §3 리스크/완화.
- [tech-stack.md](tech-stack.md) — 확정 스택 레퍼런스 페이지.
- [log.md 2026-04-17T11:45](../log.md) — Accepted 기록.
