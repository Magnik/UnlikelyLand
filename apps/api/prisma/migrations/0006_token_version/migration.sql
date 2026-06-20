-- Short-lived access + refresh tokens: a per-user token version, bumped on
-- logout/ban to invalidate outstanding tokens. Additive with a safe default.

ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
