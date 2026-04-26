-- chat v3.3 hybrid search 의 keyword half (pg_trgm `word_similarity`) 가 events.title /
-- events.ai_summary 전체를 sequential scan 하는 문제를 GIN trigram index 로 해소.
--
-- 현재 4k events 기준 ~5ms 라 무시 가능하지만 ingest 누적으로 데이터 성장 시 선형
-- 악화 (semantic-search.md §Open questions). 본 마이그레이션은 인덱스 추가만 — 쿼리
-- 변경 없음.
--
-- 인덱스는 `word_similarity(query, target) > threshold` 패턴에서 자동 사용된다 (pg_trgm
-- 의 `gin_trgm_ops` operator class). `COALESCE(ai_summary, '')` 쿼리는 NULL 을 빈
-- 문자열로 변환해 인덱스 컬럼과 함수 일치시키도록 expression index 사용.
--
-- 동시성: `CREATE INDEX CONCURRENTLY` 는 트랜잭션 안에서 못 돌리므로 prisma 마이그레이션
-- 파일에서는 일반 `CREATE INDEX` 사용 (Phase 1 내 events 4k → 락 ~수십ms 수준 허용).
-- 프로덕션 대규모 데이터 전환 시 별도 수동 CONCURRENTLY 실행 후 본 마이그레이션은
-- `CREATE INDEX IF NOT EXISTS` 로 idempotent.

CREATE INDEX IF NOT EXISTS idx_events_title_trgm
    ON events USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_events_ai_summary_trgm
    ON events USING GIN ((COALESCE(ai_summary, '')) gin_trgm_ops);
