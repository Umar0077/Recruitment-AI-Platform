CREATE TABLE "admin_credentials" (
"id" UUID NOT NULL, "user_id" UUID NOT NULL, "email" TEXT NOT NULL, "password_hash" TEXT NOT NULL,
"must_change_password" BOOLEAN NOT NULL DEFAULT true, "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
"locked_until" TIMESTAMPTZ(3), "password_changed_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
CONSTRAINT "admin_credentials_pkey" PRIMARY KEY ("id"), CONSTRAINT "admin_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE UNIQUE INDEX "admin_credentials_user_id_key" ON "admin_credentials"("user_id");
CREATE UNIQUE INDEX "admin_credentials_email_key" ON "admin_credentials"("email");
CREATE TABLE "admin_sessions" (
"id" UUID NOT NULL, "credential_id" UUID NOT NULL, "token_hash" TEXT NOT NULL, "expires_at" TIMESTAMPTZ(3) NOT NULL,
"last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id"), CONSTRAINT "admin_sessions_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "admin_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");
CREATE INDEX "admin_sessions_credential_id_revoked_at_idx" ON "admin_sessions"("credential_id", "revoked_at");
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");
