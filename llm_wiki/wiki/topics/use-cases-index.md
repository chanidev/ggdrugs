---
title: 유스케이스 인덱스 (A_100 ~ A_700)
type: topic
created: 2026-04-17
updated: 2026-04-23
sources: [2026-04-17_requirements-v5, 2026-04-17_ui-flow-draft]
related:
  - ../sources/2026-04-17_requirements-v5.md
  - ../sources/2026-04-17_ui-flow-draft.md
  - main-page-flow.md
  - event-detail-review-flow.md
  - uploader-flow.md
  - admin-flow.md
  - admin-account-management.md
  - auth-flow.md
---

# 유스케이스 인덱스

## Summary

v5.0 요구사항정의서 Ⅱ장의 13개 유스케이스 요약. 기능 ID(GG-*)와 우선순위, 관련 액터, 주요 흐름 요약. ★는 v5.0 신규/변경 항목.

## Key points

### 인증 (AUTH)
| ID | 이름 | 우선순위 | 액터 | 핵심 |
|---|---|---|---|---|
| A_100 [수정] | API 회원가입 | 상 | 비회원 | Google/Kakao 소셜 가입. **원 액션 자동 복귀** (2026-04-23 ship) — `loginUrl(provider)` 헬퍼가 현재 path 를 `?returnTo=` 로 인코딩, OAuth callback 이 same-origin 검증 후 `${WEB_URL}${returnTo}` 로 redirect. [auth-flow §A_100](auth-flow.md) 참조. |
| A_101 | 로그인 | 상 | 사용자 | Google/Kakao API 연동. |

### 메인·검색 (MAIN / CHAT / FILTER / UPCOMING)
| ID | 이름 | 우선순위 | 액터 | 핵심 |
|---|---|---|---|---|
| A_200 [수정] | 메인 페이지 | 상 | 일반 사용자, 비회원 | 사이드바(필터+전체목록), 중앙 지도, 지도 하단 채팅, 상단 '예정 이벤트' 탭. 로그인 여부 무관 진입. |
| A_201 | 채팅방 검색 | 상 | 사용자, LLM | LLM이 필터 5종 기준 질문 → 대화로 조건 좁힘 → '목록보기'로 중간 확인. |
| A_202 [수정] | 필터 검색 | 상 | 사용자 | 5종 필터(지역·기간·인원구성·종류·성향) 다중 선택 → 적용 → 지도+리스트 표시. |
| ★ A_203 [신규] | 예정 이벤트 조회 | 상 | 일반 사용자 | 메인 상단 탭. 현재 이후 개최 예정 이벤트 리스트 뷰(3/6/전체 기간 토글). 카드 클릭 시 지도 전환. 알림 설정 연동. |

### 목록·상세 (LIST / DETAIL)
| ID | 이름 | 우선순위 | 액터 | 핵심 |
|---|---|---|---|---|
| A_300 | 전체 목록 조회 | 중 | 일반 사용자 | **카테고리 9버튼(전체/8종)** — v5.0 원안 5버튼(4종) 에서 `exhibition/performance/education/movie` 확장 (2026-04-18). 요약 팝업에서 지도 핀 확대. |
| A_400 | 상세페이지 | 중 | 일반 사용자 | 포스터+북마크, 개요, 프로그램, 관련 기사·이슈. (AI 비디오 제거됨) |

### 마이페이지 (MY / REVIEW / ROLE)
| ID | 이름 | 우선순위 | 액터 | 핵심 |
|---|---|---|---|---|
| A_500 [수정] | 마이페이지 | 상 | 일반 사용자 | 월간 캘린더 중앙 배치, 저장 이벤트 배지. 배지 클릭 시 우측 요약 팝업. 역할 전환 버튼 상시. |
| ★ A_501 [신규] | 이벤트 리뷰 작성 | 중 | 일반 사용자 | 캘린더 요약 팝업의 '리뷰 작성' 버튼. **이벤트 종료일 이후에만 활성화**. 별점(1~5) + 텍스트(≥10자 권장) + 사진 최대 5장. 1인 1이벤트 1리뷰. |

### 업로더 (UREG / UMAIN / UPLOAD)
| ID | 이름 | 우선순위 | 액터 | 핵심 |
|---|---|---|---|---|
| A_600 [수정] | 업로더 역할 승급 | 상 | 일반 사용자 → 업로더 후보 | 기존 계정에 uploader 역할 추가 신청. 이름·소속·연락처·**사업자번호 XOR CI 해시** (ADR 0003 — 주민번호 제거)·증명사진·약관. rejected 7d 쿨다운. |
| A_601 | 업로더 전용 메인페이지 | 상 | 업로더 | 본인 등록 이벤트 그리드(상태별: 대기/보완/반려/완료). '이벤트 업로드' 버튼으로 A_602. |
| A_602 | 이벤트 업로드 | 상 | 업로더 | 서류 ≥2종(상위기관 승인서/허가서/사업자등록증/기타 신분), 기본정보, 이벤트 종류 택1, 상위 2개 expected_companion. |

### 관리자 (ADMIN)
| ID | 이름 | 우선순위 | 액터 | 핵심 |
|---|---|---|---|---|
| A_700 | 이벤트 승인 및 라벨 부여 | 상 | 관리자 | **5 탭** (Events vibe 라벨 / Uploads 심사 / Uploaders 심사 / **Members 회원·admin 관리** / Audit). 서류 검토 후 승인/보완/반려 + 이벤트 성향 라벨 직접 부여 (LLM 위임 금지, CLAUDE.md §6-4). 모든 admin 액션은 `admin_audit_logs` 자동 기록 (ADR 0004 D-6 + ADR 0005). |

## Open questions / contradictions

- A_300 / A_400 우선순위 "중" 표기 — 실제로는 메인 진입점이라 "상" 수준. 요구사항 v5.0 라벨 자체는 그대로 두고 본 wiki 만 운영 우선순위로 정정 (별도 ADR 불필요).
- ~~A_602 서류 PDF 미허용~~ → **해소** (마이그레이션 `20260421110000_allow_pdf_in_approval_docs`): `approval_documents.mime_type IN ('image/jpeg','image/png','application/pdf')`.
- ~~A_203 조건 기반 알림 스키마~~ → **해소** (ADR 0001 #7 + subscriptions-notifications.md ship): `event_subscriptions` 테이블 + 5축 매칭 + 2단계 dedup + notifications fan-out.

## References

- [2026-04-17_requirements-v5](../sources/2026-04-17_requirements-v5.md) — Ⅱ장 유스케이스 + Ⅲ장 기능 요구사항
- [2026-04-17_ui-flow-draft](../sources/2026-04-17_ui-flow-draft.md) — 와이어프레임 시각 대응
