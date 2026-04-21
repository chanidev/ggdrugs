-- A_602 서류 MIME 화이트리스트에 PDF 추가. 사업자등록증·허가서는 실무에서
-- PDF 스캔본이 일반적이므로 이미지만 허용은 비현실적.
ALTER TABLE "approval_documents" DROP CONSTRAINT IF EXISTS "chk_doc_mime";
ALTER TABLE "approval_documents"
  ADD CONSTRAINT "chk_doc_mime"
  CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf'));
