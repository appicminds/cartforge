-- Staff invitations (Next 1).
CREATE TABLE "store_invitations" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_invitations_email_lowercase" CHECK ("email" = lower("email"))
);

CREATE UNIQUE INDEX "store_invitations_token_hash_key" ON "store_invitations"("token_hash");
CREATE INDEX "store_invitations_store_id_email_idx" ON "store_invitations"("store_id", "email");

ALTER TABLE "store_invitations" ADD CONSTRAINT "store_invitations_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_invitations" ADD CONSTRAINT "store_invitations_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
