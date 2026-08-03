-- TOTP (Google Authenticator) for user login

ALTER TABLE "users" ADD COLUMN "totp_secret_enc" TEXT;
ALTER TABLE "users" ADD COLUMN "totp_pending_secret_enc" TEXT;
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" TIMESTAMP(3);
