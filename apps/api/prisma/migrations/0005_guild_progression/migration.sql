-- Guild progression: an Oddments (crafting currency) bank + guild XP that drives a
-- derived guild level. Additive with safe defaults so existing guilds backfill.

ALTER TABLE "Guild" ADD COLUMN     "bankBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;
