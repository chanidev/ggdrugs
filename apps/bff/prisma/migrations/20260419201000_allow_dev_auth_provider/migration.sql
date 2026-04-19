-- Stage 1 dev login stub 을 위해 auth_provider 허용값에 'dev' 추가.
-- Stage 2 (Google OAuth 실제 붙인 뒤) 에 다시 'google','kakao' 만으로 좁힐 수 있음.

ALTER TABLE "users" DROP CONSTRAINT "chk_users_provider";
ALTER TABLE "users" ADD CONSTRAINT "chk_users_provider" CHECK (auth_provider IN ('google','kakao','dev'));
