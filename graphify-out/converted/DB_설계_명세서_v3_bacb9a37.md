<!-- converted from DB_설계_명세서_v3.docx -->


데이터베이스 설계 명세서
자연어 처리 기반 이벤트 및 이슈 지도 검색 서비스
GGudrugs' Team
Version 3.0  |  2026. 04.

# Table of Contents
(Word에서 열어 TOC 필드를 갱신하세요)
전체 테이블 목록 (20개)

# Table Specifications
## 1. regions
행정구역 마스터 테이블. 지도 기반 필터 검색의 기준 데이터이며, 사용자 거주지 및 이벤트 위치 참조에 사용된다.
Column Specification
Index Specification

## 2. users
일반 사용자 계정 테이블. OAuth 소셜 로그인(Google, Kakao)을 통해 가입하며, 업로더 전환 시 uploader_profiles와 1:1 확장된다.
Column Specification
Index Specification

## 3. uploader_profiles
업로더(축제 기획자, 공공기관, 사설 단체) 확장 프로필. users 테이블과 1:1 관계이며, 마이페이지에서 업로더 전환 시 생성된다.
Column Specification
Index Specification

## 4. event_categories
이벤트 유형 마스터 테이블. 전체목록조회(A_300)의 5개 필터 버튼(전체/축제/박람회/심포지움/컨퍼런스)에 대응한다.
Column Specification

## 5. events
이벤트/축제 통합 테이블. 크롤링 수집 데이터(source_type=crawled)와 업로더 직접 등록 데이터(source_type=uploaded)가 공존한다. 크롤링 데이터는 승인 없이 approved, 업로더 데이터는 관리자 승인 플로우를 거친다.
Column Specification
Index Specification

## 6. event_tendency_labels
축제 성향 라벨 마스터 테이블. 관리자가 이벤트 승인 시 부여하는 라벨을 정의하며, 필터 검색의 성향 필터에 대응한다.
Column Specification

## 7. event_label_assignments
이벤트-성향 라벨 매핑 테이블. 관리자가 이벤트 승인(A_700) 시 성향 라벨을 부여하면 기록된다.
Column Specification
Index Specification

## 8. approval_documents
업로더 이벤트 등록 시 첨부하는 상위기관 승인 서류. JPG/PNG만 허용, 10MB 이하 제한.
Column Specification
Index Specification

## 9. approval_logs
관리자 승인/보류/거절 처리 이력. 감사 추적(audit trail) 목적으로 모든 처리 내역을 기록한다.
Column Specification
Index Specification

## 10. bookmarks
사용자 이벤트 북마크(찜). 마이페이지 캘린더에 표시되며, 사용자당 이벤트당 1개만 허용된다.
Column Specification
Index Specification

## 11. reviews
이벤트 리뷰. 1인 1이벤트 1리뷰 정책이며, AI 감성분석 결과(sentiment)를 포함한다. 긍정/부정 대표 케이스 노출에 활용된다.
Column Specification
Index Specification

## 12. notifications
사용자 알림. 이벤트 일정 기반 예약 발송 기능으로, 마이페이지 알림 설정(A_500)에서 구성된다.
Column Specification
Index Specification

## 13. search_logs
검색 이력 로그. 필터 검색과 채팅 검색의 파라미터를 JSONB로 저장한다. 날짜 기반 RANGE 파티셔닝 적용, 90일 보관 정책.
Column Specification
Index Specification

## 14. chat_sessions
LLM 대화 검색 세션. 사용자가 채팅 검색(A_201)을 시작할 때마다 새 세션이 생성된다.
Column Specification
Index Specification

## 15. chat_messages
LLM 채팅 메시지 로그. 세션 내 사용자-어시스턴트 간 대화 내용을 저장한다. 날짜 기반 RANGE 파티셔닝 적용.
Column Specification
Index Specification

## 16. news_articles
동아일보 등 뉴스 기사 원본 저장 테이블. 크롤링으로 수집하며, 이벤트-기사 매칭 및 AI 요약의 소스 데이터로 활용된다.
Column Specification
Index Specification

## 17. event_article_mappings
이벤트-기사 N:M 매핑 테이블. 관련도 점수(relevance_score)를 포함하며, 상세페이지 기사 링크 표시에 활용된다.
Column Specification
Index Specification

## 18. photo_albums
사용자 사진 앨범. 이벤트별 자동 그룹핑 또는 수동 생성이 가능하며, event_id가 NULL이면 이벤트 미연결 앨범이다.
Column Specification
Index Specification

## 19. photos
사진 개별 파일 메타데이터. 실제 파일은 오브젝트 스토리지(S3 등)에 저장하고, DB에는 경로와 AI 태그만 관리한다.
Column Specification
Index Specification

## 20. user_taste_profiles
사용자 축제 취향 프로필. 사용자 라벨링(축제 즐기는 스타일) 기능에 대응하며, 추천 알고리즘의 입력 데이터로 활용된다.
Column Specification
Index Specification

# Appendix: Design Decisions
1. Soft Delete
users, events, reviews 테이블에 is_deleted + deleted_at 패턴을 적용한다. 물리 삭제 대신 논리 삭제로 데이터 복구 가능성을 확보하며, 부분 인덱스(WHERE is_deleted = false)로 조회 성능을 유지한다.
2. Denormalized Cache
events 테이블의 bookmark_count, avg_rating, review_count는 비정규화 캐시 컬럼이다. 상세페이지 조회 시 매번 집계 쿼리를 방지하며, 북마크/리뷰 CUD 시 애플리케이션 단에서 갱신한다.
3. Partitioning
search_logs, chat_messages는 날짜 기반 RANGE 파티셔닝을 적용한다. 로그성 데이터의 빠른 적재와 오래된 파티션의 효율적 삭제(DROP PARTITION)를 위함이다.
4. Region Normalization
지역 정보를 regions 마스터 테이블로 분리하여 일관된 필터 검색을 보장한다. 시/도, 시/군/구, 동 3단계로 구성하며, 지도 줌 레벨에 따른 계층적 검색이 가능하다.
5. Label System
축제 성향 라벨(event_tendency_labels)은 마스터-매핑 패턴으로 구현한다. 라벨 그룹(mood/activity/theme)별로 분류하며, 하나의 이벤트에 복수 라벨을 부여할 수 있다.
6. Unified Events Table
크롤링 데이터와 업로더 등록 데이터를 하나의 events 테이블에 통합하고 source_type으로 구분한다. 사용자 검색 시 동일한 쿼리 경로를 타므로 코드 복잡도가 줄어든다.
7. Audit Trail
approval_logs 테이블로 모든 승인/보류/거절 이력을 기록한다. updated_at은 트리거로 자동 갱신하여 변경 이력의 일관성을 확보한다.
8. Extension Readiness
pg_trgm(제목 유사 검색), PostGIS(반경 검색), pgvector(기사-이벤트 벡터 매칭)는 필요 시 활성화할 수 있도록 인덱스 구조를 사전 설계하였다.
| DBMS | PostgreSQL 15+ |
| --- | --- |
| Character Set | UTF-8 |
| Naming Convention | snake_case (tables, columns, indexes) |
| Soft Delete | is_deleted + deleted_at (users, events, reviews) |
| Partitioning | RANGE by created_at (search_logs, chat_messages) |
| Extensions | pg_trgm, PostGIS (optional), pgvector (optional) |
| No. | Table Name | Description |
| --- | --- | --- |
| 1 | regions | 행정구역 마스터 테이블. 지도 기반 필터 검색의 기준 데이터이며, 사용자 거주지 및 이벤트 위치 참조에 사용된다. |
| 2 | users | 일반 사용자 계정 테이블. OAuth 소셜 로그인(Google, Kakao)을 통해 가입하며, 업로더 전환 시 uploader_profiles와... |
| 3 | uploader_profiles | 업로더(축제 기획자, 공공기관, 사설 단체) 확장 프로필. users 테이블과 1:1 관계이며, 마이페이지에서 업로더 전환 시 생성된다. |
| 4 | event_categories | 이벤트 유형 마스터 테이블. 전체목록조회(A_300)의 5개 필터 버튼(전체/축제/박람회/심포지움/컨퍼런스)에 대응한다. |
| 5 | events | 이벤트/축제 통합 테이블. 크롤링 수집 데이터(source_type=crawled)와 업로더 직접 등록 데이터(source_type=upload... |
| 6 | event_tendency_labels | 축제 성향 라벨 마스터 테이블. 관리자가 이벤트 승인 시 부여하는 라벨을 정의하며, 필터 검색의 성향 필터에 대응한다. |
| 7 | event_label_assignments | 이벤트-성향 라벨 매핑 테이블. 관리자가 이벤트 승인(A_700) 시 성향 라벨을 부여하면 기록된다. |
| 8 | approval_documents | 업로더 이벤트 등록 시 첨부하는 상위기관 승인 서류. JPG/PNG만 허용, 10MB 이하 제한. |
| 9 | approval_logs | 관리자 승인/보류/거절 처리 이력. 감사 추적(audit trail) 목적으로 모든 처리 내역을 기록한다. |
| 10 | bookmarks | 사용자 이벤트 북마크(찜). 마이페이지 캘린더에 표시되며, 사용자당 이벤트당 1개만 허용된다. |
| 11 | reviews | 이벤트 리뷰. 1인 1이벤트 1리뷰 정책이며, AI 감성분석 결과(sentiment)를 포함한다. 긍정/부정 대표 케이스 노출에 활용된다. |
| 12 | notifications | 사용자 알림. 이벤트 일정 기반 예약 발송 기능으로, 마이페이지 알림 설정(A_500)에서 구성된다. |
| 13 | search_logs | 검색 이력 로그. 필터 검색과 채팅 검색의 파라미터를 JSONB로 저장한다. 날짜 기반 RANGE 파티셔닝 적용, 90일 보관 정책. |
| 14 | chat_sessions | LLM 대화 검색 세션. 사용자가 채팅 검색(A_201)을 시작할 때마다 새 세션이 생성된다. |
| 15 | chat_messages | LLM 채팅 메시지 로그. 세션 내 사용자-어시스턴트 간 대화 내용을 저장한다. 날짜 기반 RANGE 파티셔닝 적용. |
| 16 | news_articles | 동아일보 등 뉴스 기사 원본 저장 테이블. 크롤링으로 수집하며, 이벤트-기사 매칭 및 AI 요약의 소스 데이터로 활용된다. |
| 17 | event_article_mappings | 이벤트-기사 N:M 매핑 테이블. 관련도 점수(relevance_score)를 포함하며, 상세페이지 기사 링크 표시에 활용된다. |
| 18 | photo_albums | 사용자 사진 앨범. 이벤트별 자동 그룹핑 또는 수동 생성이 가능하며, event_id가 NULL이면 이벤트 미연결 앨범이다. |
| 19 | photos | 사진 개별 파일 메타데이터. 실제 파일은 오브젝트 스토리지(S3 등)에 저장하고, DB에는 경로와 AI 태그만 관리한다. |
| 20 | user_taste_profiles | 사용자 축제 취향 프로필. 사용자 라벨링(축제 즐기는 스타일) 기능에 대응하며, 추천 알고리즘의 입력 데이터로 활용된다. |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| region_id | BIGSERIAL | N |  | PK | 지역 고유 식별자 |
| sido_name | VARCHAR(30) | N |  |  | 시/도 (서울특별시, 경기도 등) |
| sigungu_name | VARCHAR(30) | Y |  |  | 시/군/구 |
| dong_name | VARCHAR(30) | Y |  |  | 읍/면/동 |
| full_address | VARCHAR(100) | N |  |  | 조합된 전체 주소 문자열 |
| created_at | TIMESTAMPTZ | N | now() |  | 레코드 생성 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_regions_sido | sido_name | B-Tree |  |
| idx_regions_sigungu | sido_name, sigungu_name | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| user_id | BIGSERIAL | N |  | PK | 사용자 고유 식별자 |
| social_uid | VARCHAR(255) | N |  | UQ (with provider) | OAuth 제공자 발급 고유 ID |
| auth_provider | VARCHAR(20) | N |  | CHECK | 인증 제공자 (google, kakao) |
| nickname | VARCHAR(50) | N |  |  | 사용자 닉네임 |
| gender | CHAR(1) | Y |  | CHECK (M,F) | 성별 |
| date_of_birth | DATE | Y |  |  | 생년월일 |
| region_id | BIGINT | Y |  | FK(regions) | 거주 지역 참조 |
| is_notification_on | BOOLEAN | N | false |  | 추천 알림 수신 여부 |
| is_deleted | BOOLEAN | N | false |  | 소프트 삭제 플래그 |
| last_logged_in_at | TIMESTAMPTZ | Y |  |  | 마지막 로그인 시각 |
| created_at | TIMESTAMPTZ | N | now() |  | 계정 생성 시각 |
| updated_at | TIMESTAMPTZ | N | now() | Auto trigger | 마지막 수정 시각 |
| deleted_at | TIMESTAMPTZ | Y |  |  | 소프트 삭제 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_users_provider_uid | auth_provider, social_uid | B-Tree |  |
| idx_users_region | region_id | B-Tree | is_deleted = false |
| idx_users_created | created_at | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| uploader_id | BIGSERIAL | N |  | PK | 업로더 고유 식별자 |
| user_id | BIGINT | N |  | FK(users), UQ | 연결된 사용자 ID (1:1) |
| organization_name | VARCHAR(100) | N |  |  | 소속 기관 또는 단체명 |
| contact_phone | VARCHAR(20) | N |  |  | 연락처 전화번호 |
| contact_email | VARCHAR(255) | N |  | CHECK (email format) | 연락처 이메일 |
| approval_status | VARCHAR(20) | N | pending | CHECK | 승인 상태 (pending, approved, rejected) |
| approved_at | TIMESTAMPTZ | Y |  |  | 승인 완료 시각 |
| created_at | TIMESTAMPTZ | N | now() |  | 프로필 생성 시각 |
| updated_at | TIMESTAMPTZ | N | now() | Auto trigger | 마지막 수정 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_uploader_status | approval_status | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| category_id | BIGSERIAL | N |  | PK | 카테고리 고유 식별자 |
| category_code | VARCHAR(30) | N |  | UQ | 시스템 코드 (festival, expo 등) |
| display_name | VARCHAR(50) | N |  |  | 화면 표시명 (축제, 박람회 등) |
| sort_order | SMALLINT | N | 0 |  | 정렬 순서 |
| is_active | BOOLEAN | N | true |  | 활성 여부 |
| created_at | TIMESTAMPTZ | N | now() |  | 생성 시각 |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| event_id | BIGSERIAL | N |  | PK | 이벤트 고유 식별자 |
| uploader_id | BIGINT | Y |  | FK(uploader_profiles) | 등록 업로더 (크롤링 시 NULL) |
| category_id | BIGINT | N |  | FK(event_categories) | 이벤트 유형 참조 |
| region_id | BIGINT | N |  | FK(regions) | 이벤트 소재 지역 참조 |
| source_type | VARCHAR(20) | N |  | CHECK | 데이터 출처 (crawled, uploaded) |
| crawl_origin | VARCHAR(50) | Y |  |  | 크롤링 원본 출처명 |
| external_source_id | VARCHAR(100) | Y |  | UQ (with crawl_origin) | 외부 원본 ID (중복 수집 방지) |
| title | VARCHAR(200) | N |  |  | 이벤트 제목 |
| description | TEXT | Y |  |  | 이벤트 상세 설명 |
| address_detail | VARCHAR(255) | Y |  |  | 상세 주소 (도로명 등) |
| latitude | DECIMAL(10,7) | Y |  |  | 위도 좌표 |
| longitude | DECIMAL(10,7) | Y |  |  | 경도 좌표 |
| start_date | DATE | N |  | CHECK (<=end) | 시작일 |
| end_date | DATE | N |  | CHECK (>=start) | 종료일 |
| operating_hours | VARCHAR(100) | Y |  |  | 운영 시간 (텍스트) |
| target_audience | VARCHAR(100) | Y |  |  | 대상 (전 연령, 성인 등) |
| admission_fee | VARCHAR(100) | Y |  |  | 입장료 정보 (텍스트) |
| companion_primary | VARCHAR(20) | Y |  | CHECK | 기대 동행 1순위 (family/friend/couple/solo) |
| companion_secondary | VARCHAR(20) | Y |  | CHECK | 기대 동행 2순위 |
| poster_image_url | VARCHAR(500) | Y |  |  | 포스터 이미지 URL |
| approval_status | VARCHAR(20) | N | pending | CHECK | 승인 상태 (pending/approved/on_hold/rejected) |
| phase | VARCHAR(20) | N | upcoming | CHECK | 시점 상태 (upcoming/ongoing/ended) |
| bookmark_count | INT | N | 0 |  | 북마크 수 (비정규화 캐시) |
| avg_rating | DECIMAL(3,2) | N | 0 | CHECK (0~5) | 평균 평점 (비정규화 캐시) |
| review_count | INT | N | 0 |  | 리뷰 수 (비정규화 캐시) |
| is_deleted | BOOLEAN | N | false |  | 소프트 삭제 플래그 |
| approved_at | TIMESTAMPTZ | Y |  |  | 승인 완료 시각 |
| created_at | TIMESTAMPTZ | N | now() |  | 레코드 생성 시각 |
| updated_at | TIMESTAMPTZ | N | now() | Auto trigger | 마지막 수정 시각 |
| deleted_at | TIMESTAMPTZ | Y |  |  | 소프트 삭제 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_events_filter | region_id, category_id, start_date, phase | B-Tree | is_deleted=false AND approval_status='approved' |
| idx_events_phase | phase, start_date | B-Tree | is_deleted=false AND approval_status='approved' |
| idx_events_approval | approval_status, created_at | B-Tree | is_deleted=false |
| idx_events_uploader | uploader_id | B-Tree | uploader_id IS NOT NULL |
| idx_events_geo | latitude, longitude | B-Tree | is_deleted=false AND approval_status='approved' |
| idx_events_dates | start_date, end_date | B-Tree | is_deleted=false AND approval_status='approved' |
| idx_events_title_trgm | title | GIN (trigram) | is_deleted=false |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| label_id | BIGSERIAL | N |  | PK | 라벨 고유 식별자 |
| label_name | VARCHAR(50) | N |  | UQ | 라벨명 (활동적, 정적, 문화체험 등) |
| label_group | VARCHAR(30) | N |  | CHECK | 라벨 분류 (mood, activity, theme) |
| is_active | BOOLEAN | N | true |  | 활성 여부 |
| created_at | TIMESTAMPTZ | N | now() |  | 생성 시각 |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| assignment_id | BIGSERIAL | N |  | PK | 매핑 고유 식별자 |
| event_id | BIGINT | N |  | FK(events) | 대상 이벤트 |
| label_id | BIGINT | N |  | FK(event_tendency_labels) | 부여된 라벨 |
| assigned_by | BIGINT | N |  | FK(users) | 부여한 관리자 user_id |
| created_at | TIMESTAMPTZ | N | now() |  | 부여 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_label_assign_event | event_id | B-Tree |  |
| idx_label_assign_label | label_id | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| document_id | BIGSERIAL | N |  | PK | 문서 고유 식별자 |
| event_id | BIGINT | N |  | FK(events) | 관련 이벤트 |
| file_path | VARCHAR(500) | N |  |  | 파일 저장 경로 (오브젝트 스토리지) |
| original_filename | VARCHAR(255) | N |  |  | 원본 파일명 |
| mime_type | VARCHAR(30) | N |  | CHECK | MIME 타입 (image/jpeg, image/png) |
| file_size_bytes | INT | N |  | CHECK (>0, <=10MB) | 파일 크기 (bytes) |
| created_at | TIMESTAMPTZ | N | now() |  | 업로드 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_approval_docs_event | event_id | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| log_id | BIGSERIAL | N |  | PK | 로그 고유 식별자 |
| event_id | BIGINT | N |  | FK(events) | 대상 이벤트 |
| admin_id | BIGINT | N |  | FK(users) | 처리 관리자 user_id |
| action | VARCHAR(20) | N |  | CHECK | 처리 결과 (approved, on_hold, rejected) |
| reason | TEXT | Y |  |  | 보류/거절 사유 |
| created_at | TIMESTAMPTZ | N | now() |  | 처리 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_approval_logs_event | event_id, created_at DESC | B-Tree |  |
| idx_approval_logs_admin | admin_id, created_at DESC | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| bookmark_id | BIGSERIAL | N |  | PK | 북마크 고유 식별자 |
| user_id | BIGINT | N |  | FK(users) | 북마크한 사용자 |
| event_id | BIGINT | N |  | FK(events) | 북마크된 이벤트 |
| created_at | TIMESTAMPTZ | N | now() | UQ(user+event) | 북마크 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_bookmarks_user | user_id, created_at DESC | B-Tree |  |
| idx_bookmarks_event | event_id | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| review_id | BIGSERIAL | N |  | PK | 리뷰 고유 식별자 |
| user_id | BIGINT | N |  | FK(users) | 작성자 |
| event_id | BIGINT | N |  | FK(events) | 대상 이벤트 |
| body | TEXT | N |  |  | 리뷰 본문 |
| rating | SMALLINT | N |  | CHECK (1~5) | 평점 (1~5) |
| sentiment | VARCHAR(10) | Y |  | CHECK | AI 감성분석 결과 (positive/negative/neutral) |
| is_deleted | BOOLEAN | N | false |  | 소프트 삭제 플래그 |
| created_at | TIMESTAMPTZ | N | now() | UQ(user+event) | 작성 시각 |
| updated_at | TIMESTAMPTZ | N | now() | Auto trigger | 마지막 수정 시각 |
| deleted_at | TIMESTAMPTZ | Y |  |  | 소프트 삭제 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_reviews_event | event_id, created_at DESC | B-Tree | is_deleted = false |
| idx_reviews_user | user_id, created_at DESC | B-Tree | is_deleted = false |
| idx_reviews_sentiment | event_id, sentiment | B-Tree | is_deleted = false |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| notification_id | BIGSERIAL | N |  | PK | 알림 고유 식별자 |
| user_id | BIGINT | N |  | FK(users) | 수신 사용자 |
| event_id | BIGINT | Y |  | FK(events) | 관련 이벤트 (시스템 알림 시 NULL) |
| title | VARCHAR(100) | N |  |  | 알림 제목 |
| message | TEXT | N |  |  | 알림 내용 |
| scheduled_at | TIMESTAMPTZ | N |  |  | 예약 발송 시각 |
| is_sent | BOOLEAN | N | false | CHECK (consistency) | 발송 완료 여부 |
| sent_at | TIMESTAMPTZ | Y |  |  | 실제 발송 시각 |
| created_at | TIMESTAMPTZ | N | now() |  | 알림 생성 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_notif_pending | scheduled_at | B-Tree | is_sent = false |
| idx_notif_user | user_id, created_at DESC | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| log_id | BIGSERIAL | N |  | PK | 로그 고유 식별자 |
| user_id | BIGINT | N |  | FK(users) | 검색 사용자 |
| search_type | VARCHAR(10) | N |  | CHECK | 검색 유형 (filter, chat) |
| search_params | JSONB | N | '{}' |  | 검색 조건 파라미터 (JSON) |
| created_at | TIMESTAMPTZ | N | now() | Partition key | 검색 시각 (파티션 키) |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_search_logs_user | user_id, created_at DESC | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| session_id | BIGSERIAL | N |  | PK | 세션 고유 식별자 |
| user_id | BIGINT | N |  | FK(users) | 세션 소유 사용자 |
| is_active | BOOLEAN | N | true |  | 세션 활성 여부 |
| created_at | TIMESTAMPTZ | N | now() |  | 세션 시작 시각 |
| ended_at | TIMESTAMPTZ | Y |  |  | 세션 종료 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_chat_sessions_user | user_id, created_at DESC | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| message_id | BIGSERIAL | N |  | PK | 메시지 고유 식별자 |
| session_id | BIGINT | N |  | FK(chat_sessions) | 소속 세션 |
| sender_type | VARCHAR(10) | N |  | CHECK | 발신자 유형 (user, assistant) |
| body | TEXT | N |  |  | 메시지 내용 |
| created_at | TIMESTAMPTZ | N | now() | Partition key | 발신 시각 (파티션 키) |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_chat_msg_session | session_id, created_at | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| article_id | BIGSERIAL | N |  | PK | 기사 고유 식별자 |
| source_name | VARCHAR(30) | N | 'donga' |  | 기사 출처 (donga 등) |
| author_name | VARCHAR(50) | Y |  |  | 기자명 |
| article_category | VARCHAR(50) | Y |  |  | 기사 분류 (문화, 사회, 지역 등) |
| title | VARCHAR(300) | N |  |  | 기사 제목 |
| original_url | VARCHAR(500) | N |  | UQ | 원본 기사 URL (중복 크롤링 방지) |
| content_body | TEXT | Y |  |  | 기사 본문 전체 |
| summary | TEXT | Y |  |  | AI 자동 생성 요약문 |
| metadata | JSONB | N | '{}' |  | 추가 메타데이터 (태그, 섹션, 조회수 등) |
| published_at | TIMESTAMPTZ | Y |  |  | 기사 게시 시각 |
| crawled_at | TIMESTAMPTZ | N | now() |  | 크롤링 수집 시각 |
| created_at | TIMESTAMPTZ | N | now() |  | 레코드 생성 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_articles_published | published_at DESC | B-Tree |  |
| idx_articles_source | source_name, published_at DESC | B-Tree |  |
| idx_articles_title_trgm | title | GIN (trigram) |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| mapping_id | BIGSERIAL | N |  | PK | 매핑 고유 식별자 |
| event_id | BIGINT | N |  | FK(events) | 대상 이벤트 |
| article_id | BIGINT | N |  | FK(news_articles) | 매칭된 기사 |
| relevance_score | DECIMAL(5,4) | N | 0 | CHECK (0~1), UQ(event+article) | 관련도 점수 (0.0000~1.0000) |
| matched_at | TIMESTAMPTZ | N | now() |  | 매칭 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_evt_art_event | event_id, relevance_score DESC | B-Tree |  |
| idx_evt_art_article | article_id | B-Tree |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| album_id | BIGSERIAL | N |  | PK | 앨범 고유 식별자 |
| user_id | BIGINT | N |  | FK(users) | 앨범 소유 사용자 |
| event_id | BIGINT | Y |  | FK(events) | 연결된 이벤트 (NULL 가능) |
| album_name | VARCHAR(100) | N |  |  | 앨범명 |
| created_at | TIMESTAMPTZ | N | now() |  | 앨범 생성 시각 |
| updated_at | TIMESTAMPTZ | N | now() | Auto trigger | 마지막 수정 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_albums_user | user_id, created_at DESC | B-Tree |  |
| idx_albums_event | event_id | B-Tree | event_id IS NOT NULL |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| photo_id | BIGSERIAL | N |  | PK | 사진 고유 식별자 |
| album_id | BIGINT | N |  | FK(photo_albums) | 소속 앨범 |
| file_path | VARCHAR(500) | N |  |  | 파일 저장 경로 (오브젝트 스토리지) |
| original_filename | VARCHAR(255) | N |  |  | 원본 파일명 |
| ai_tags | JSONB | N | '{}' |  | AI 이미지 인식 태그 (장소, 인물수, 분위기 등) |
| taken_at | TIMESTAMPTZ | Y |  |  | EXIF 촬영 일시 |
| created_at | TIMESTAMPTZ | N | now() |  | 업로드 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_photos_album | album_id, created_at DESC | B-Tree |  |
| idx_photos_ai_tags | ai_tags | GIN |  |
| Column | Type | NULL | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| profile_id | BIGSERIAL | N |  | PK | 프로필 고유 식별자 |
| user_id | BIGINT | N |  | FK(users) | 사용자 참조 |
| taste_dimension | VARCHAR(30) | N |  | UQ(user+dimension) | 취향 차원 (activity_level, preferred_scale, social_style) |
| taste_value | VARCHAR(30) | N |  |  | 취향 값 (active, calm, large_scale, intimate 등) |
| created_at | TIMESTAMPTZ | N | now() |  | 생성 시각 |
| updated_at | TIMESTAMPTZ | N | now() | Auto trigger | 마지막 수정 시각 |
| Index name | Columns | Type | Condition |
| --- | --- | --- | --- |
| idx_taste_user | user_id | B-Tree |  |