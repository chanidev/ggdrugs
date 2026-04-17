# ADR 0002 — 기술 스택 결정 (오브젝트 스토리지 · LLM 공급자 · 벡터 저장소)

- **상태 (Status)**: **Accepted** (2026-04-17)
- **작성일**: 2026-04-17
- **작성자**: Claude Code (스택 점검 결과 기반)
- **승인자**: 프로젝트 오너 (찬)

---

## 1. Context

ADR 0001로 DB 스키마 정합성은 정리되었으나, **Phase 1 진입 전 결정이 필요한 인프라 공백 3건**이 남아 있었다:

1. **오브젝트 스토리지** — `approval_documents`, `review_photos`, 이벤트 포스터, `photos` 등 파일 저장 위치 미정.
2. **LLM 공급자** — `.env.example`에 OpenAI/Anthropic 키가 모두 비어 있고 정책 없음. 임베딩 모델도 미정.
3. **벡터 저장소 역할** — Qdrant(`docker-compose.yml`) + pgvector(DDL v3 주석)가 모두 언급되어 있으나 역할 분담 없음.

본 ADR은 이 3건을 확정한다.

참조: [LLM Wiki db-schema-overview](../../llm_wiki/wiki/topics/db-schema-overview.md), [docker-compose.yml](../../docker-compose.yml), [.env.example](../../.env.example)

---

## 2. Decisions

### D-1. 오브젝트 스토리지 = **MinIO** (S3 호환 자체호스팅)

- Docker Compose에 `minio` 서비스 추가 (S3 API 9000, 콘솔 9001).
- 이미지: `minio/minio:RELEASE.2024-12-18T13-15-44Z`.
- 4개 버킷 운용: `ggdrugs-approval-docs`, `ggdrugs-review-photos`, `ggdrugs-event-posters`, `ggdrugs-user-photos`.
- 애플리케이션 접근은 AWS SDK v3 (S3 호환 모드, `endpoint` 지정).

**이유**:
- Phase 0~1에는 클라우드 비용·계정 오버헤드 없음.
- S3 호환이라 프로덕션 전환 시 endpoint만 변경 (AWS S3 또는 Naver Cloud Object Storage).
- 프론트 프리사인드 URL 업로드 패턴 동일하게 사용 가능.

**마이그레이션 시점** (Phase 4+): 운영 규모가 커지면 MinIO → AWS S3 ap-northeast-2 또는 Naver Cloud Object Storage로 마이그레이션. 코드 변경은 `.env`의 `S3_ENDPOINT` 교체만.

### D-2. LLM 공급자 = **OpenAI 단일**

- 채팅 검색 (A_201): `gpt-4o` (환경변수 `OPENAI_MODEL_CHAT`).
- 감성분석 · 이미지 태깅 · 경량 분류: `gpt-4o-mini` (`OPENAI_MODEL_FAST`).
- 임베딩 (Qdrant 인덱싱용): `text-embedding-3-small` (`OPENAI_MODEL_EMBEDDING`).

**이유**:
- 계정·API 키·SDK·과금 콘솔을 **1개로 통일** → 운영 단순화.
- `text-embedding-3-small` 은 차원(1536) · 비용 · 품질 모두 합리적 (1M 토큰당 $0.02 수준).
- Anthropic 대비 한국어 자연스러움은 약간 떨어질 수 있으나, 프롬프트 튜닝으로 커버 가능한 수준.

**고려했지만 보류한 대안**:
- Anthropic Claude (한국어 품질 우수, Prompt caching 유리) — 임베딩 미제공이라 OpenAI·Voyage·자체호스팅 중 택1 추가 필요 → 이중 공급자 관리 부담.
- BGE-M3 자체호스팅 — 한국어 임베딩 품질 최상이나 GPU 인프라 필요 → Phase 0~1에 과잉.

**재평가 트리거**: 채팅 검색 응답 품질에 한국어 관련 불만이 누적되거나, 월 API 비용이 예산을 초과할 때 Anthropic 혼합 또는 전환 검토.

### D-3. 벡터 저장소 = **Qdrant 단일**

- 용도: 채팅 검색(A_201) 유사도 쿼리 + 기사-이벤트 매칭 (`event_article_mappings.relevance_score` 산출 입력).
- pgvector는 **도입하지 않음**. DDL v3 말미의 `-- CREATE EXTENSION pgvector;` 주석은 제거.
- Qdrant 이미지를 `v1.9.0` → **`v1.13.0`** 으로 업그레이드 (2024년 초 → 2025년 말 릴리즈).

**이유**:
- 단일 벡터 스토어로 임베딩 관리·재인덱싱·모니터링 단순화.
- Qdrant는 payload 필터링, 하이브리드 검색, 대규모 스케일에서 pgvector 대비 성능 우위.
- Postgres는 관계형 쿼리에 집중 — 지리·필터·트랜잭션 부하 분리.

**고려했지만 보류한 대안**:
- pgvector 단일 — 단일 DB 트랜잭션 일관성 이점 있으나, 유사도 검색 쿼리가 Postgres CPU를 잠식할 위험.
- 이중 운용 (Qdrant + pgvector 역할 분담) — 동일 임베딩 이중 관리 부담 → 현 Phase 규모 대비 오버엔지니어링.

---

## 3. Consequences

### 즉시 적용 (본 ADR Accepted 직후 — 이미 반영됨)

- [x] `docker-compose.yml` 에 MinIO 서비스 추가 + qdrant 이미지 버전 업데이트.
- [x] `.env.example` 에 MinIO · OpenAI · 버킷 이름 환경변수 정리. Anthropic 키 제거.
- [x] LLM Wiki `db-schema-overview.md` 의 extensions 섹션에서 pgvector 제거 반영.

### Phase 1 진입 시

- [ ] `apps/bff/` 에 MinIO 연동: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. 버킷 4개 자동 생성 로직 (첫 부팅 시 `ensureBucket`).
- [ ] `services/llm/` 에 OpenAI 클라이언트 초기화. 임베딩·채팅·감성분석 어댑터.
- [ ] `services/llm/` 에 Qdrant 컬렉션 스키마 정의 (이벤트·기사·리뷰 3종 예상).
- [ ] `packages/config/` 의 zod 스키마에 MinIO·OpenAI 환경변수 검증 추가.

### 운영

- MinIO 데이터는 `minio_data` named volume — `docker compose down -v` 시 삭제. 개발자 업로드 시드는 휘발성으로 간주.
- OpenAI API 키는 **개인 발급 지양**, 팀 공용 조직 계정 권장 (비용 추적 용이).
- 프로덕션 전환 시 시크릿은 `.env`가 아니라 배포 플랫폼의 시크릿 저장소로.

### 리스크 / 완화

- **MinIO 단일 장애**: 개발 환경에서는 수용 가능. 프로덕션은 S3/Naver Object Storage로 전환 → SLA 상속.
- **OpenAI 단일 공급자 의존**: API 장애 시 LLM 기능 전면 중단. `services/llm/` 설계 시 **공급자 추상화 레이어**를 두면 Anthropic fallback 추가 용이.
- **Qdrant 업그레이드 영향**: v1.9 → v1.13은 대부분 하위 호환. 컬렉션이 없는 현 시점(Phase 0)에는 무관.

---

## 4. References

- ADR 0001 — [DDL v3 ↔ 용어집 v5 정합성](0001-ddl-v3-vs-terminology-v5-reconciliation.md)
- [docker-compose.yml](../../docker-compose.yml) — MinIO 서비스 정의
- [.env.example](../../.env.example) — 환경변수 템플릿
- OpenAI 모델 가격표, Qdrant 릴리즈 노트는 외부 링크이므로 별도 기록하지 않음
