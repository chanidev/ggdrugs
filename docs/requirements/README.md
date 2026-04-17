# docs/requirements

요구사항정의서·DB 설계서 등 원본 문서의 **위치 인덱스**.

## 원본 위치

원본 바이너리 문서는 `llm_wiki/raw/` 에 있다 (LLM Wiki의 immutable source 계층):

| 문서 | 경로 |
|---|---|
| 요구사항정의서 v5.0 | `llm_wiki/raw/장원팀_요구사항정의서_5차.docx` |
| DB 설계 명세서 v3 | `llm_wiki/raw/DB_설계_명세서_v3.docx` |
| 이벤트 큐레이션 DDL v3 | `llm_wiki/raw/event_curation_ddl_v3.sql` |
| UI 플로우 와이어프레임 초안 | `llm_wiki/raw/초안.png` |

## 요약 읽기

원본 대신 LLM Wiki가 정리한 페이지를 먼저 읽는다:

- [wiki/index.md](../../llm_wiki/wiki/index.md) — 전체 내비게이션
- [용어집](../../llm_wiki/wiki/topics/terminology-glossary.md) — DB 컬럼·enum 도메인의 유일한 근거 (CLAUDE.md §5-1)
- [유스케이스 인덱스](../../llm_wiki/wiki/topics/use-cases-index.md) — A_100 ~ A_700
- [DB 스키마 개요](../../llm_wiki/wiki/topics/db-schema-overview.md) — 20 테이블

## 결정 문서

`../decisions/` 에 ADR 보관.
