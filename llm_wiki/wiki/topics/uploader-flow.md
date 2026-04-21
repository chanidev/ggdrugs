---
title: 업로더 플로우
type: topic
created: 2026-04-17
updated: 2026-04-21
sources: [2026-04-17_ui-flow-draft, 2026-04-17_requirements-v5]
related:
  - ../sources/2026-04-17_ui-flow-draft.md
  - ../sources/2026-04-17_requirements-v5.md
  - admin-flow.md
  - roles-and-active-role.md
  - event-state-machine.md
  - use-cases-index.md
  - ../../../docs/decisions/0003-uploader-pii-policy.md
---

# 업로더 플로우

## Summary

이벤트를 등록하는 업로더 역할 사용자의 전용 화면 동선. Alle 는 "1계정 = 복수 역할 토글" 모델이라, 일반 사용자가 업로더 역할을 추가로 보유하면 이 화면군에 접근한다. 업로더 메인에는 자신이 등록한 이벤트 현황이 지도/리스트로 표시되고, 신규 이벤트 등록 폼과 승인 상태별 뷰가 포함된다.

## Key points

- **A_600 승급 신청**: 기관/팀명·실명·연락처·이메일 + **사업자등록번호 XOR CI 해시** + 증빙서류 1~5장. 주민등록번호 대신 신원확인 이원화 (ADR 0003). 실 제출 UI 는 `apps/web/src/pages/UploaderPage.tsx::ApplyForm`.
- **A_601 업로더 콘솔**: 상태별 탭 (전체/대기/승인/보완/반려) × phase 4종 조합. 내 이벤트 카드 + 상세·공개 CTA. 승인됨 이벤트는 공개 페이지 링크, 보완/반려 이벤트는 수정 재제출 CTA.
- **A_601b 이벤트 수정 재제출** (2026-04-21 신규): `revision_requested` / `rejected` 상태 이벤트를 `/uploader/events/:id/edit` 에서 수정 후 재제출. 저장 시 `approvalStatus='pending'` 으로 리셋. 공유 `EventFormFields` 컴포넌트로 필드는 A_602 와 공유. 포스터 3-way 편집(유지/교체/제거), 서류 전체 교체 토글. 관리자 피드백 사유 상단 노출.
- **A_602 이벤트 업로드**: 기본 필드 (title·category·region·date·addressDetail·operatingHours·targetAudience·admissionFee) + expected_companion primary/secondary + 포스터 이미지 + 승인 서류 2~5장. MinIO presigned PUT 직접 업로드 후 메타만 BFF 로 전송.
- **역할 토글**: 마이페이지 우측 상단 + uploader 콘솔 상단. active_role='uploader' 일 때만 `/uploader/new` 접근 허용 (BFF requireUploaderActive 미들웨어 강제).

## PII identity (ADR 0003)

2026-04-21 개인정보보호법 §24-2 준수 방향으로 전환. 주민등록번호 대신:

- **기관 신청자**: `business_registration_number` 10자리 숫자 (CHAR(10), 하이픈 제거 저장).
- **개인 신청자**: `ci_hash` — PASS/NICE/카카오 본인인증 결과 CI 88자 Base64 (CHAR(88)). Dev 는 mock stub (random 66바이트 → Base64).
- **제약**: `chk_uploader_identity` CHECK 로 둘 중 하나만(XOR), 둘 다 NULL 허용(전환 기간).
- **마스킹**: 관리자 조회(`/admin/uploaders/:id`) 시 `admin.scope='full'` 만 원본. 그 외는 `realName` 첫자+***, `business_registration_number` 앞 5자리 + *****, `ci_hash` 앞/뒤 4자리 + '...'.

## Open questions / contradictions

- ~~역할 토글 UI 위치~~ → **해소**: GG-ROLE-001 "마이페이지 우측 상단 역할 전환 버튼 상시 노출".
- ~~업로더 승급 심사 진입점~~ → **해소**: 마이페이지 역할 전환 버튼(업로더 미승인 시 "업로더 신청" 라벨) → A_600 폼.
- ~~이벤트 수정 재제출 UI~~ → **해소** (2026-04-21): `/uploader/events/:id/edit` 별도 페이지. 필드 공유 컴포넌트 + 3-way 포스터 편집.
- ~~DDL에 `active_role` 컬럼 부재~~ → **해소**: ADR 0001 #2로 `users.active_role` 추가 확정.
- "작업도 목록에서 꺼내기"의 정확한 의미 판독 불가 — 이벤트 카드 드래그 / 보관 / 삭제 중 하나로 추정. 현재 구현은 soft-delete 만.

## References

- [2026-04-17_ui-flow-draft](../sources/2026-04-17_ui-flow-draft.md) — 섹션 7-1 ~ 7-5
- [../../../docs/decisions/0003-uploader-pii-policy.md](../../../docs/decisions/0003-uploader-pii-policy.md) — PII 정책 ADR
- [roles-and-active-role.md](roles-and-active-role.md)
- [event-state-machine.md](event-state-machine.md)
