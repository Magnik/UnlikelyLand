-- Integrity hardening (milestone 3 follow-up):
--   * Real foreign keys (ON DELETE CASCADE) for the social-graph join tables, which
--     previously stored loose ids and orphaned rows when a character was deleted.
--   * Reverse-lookup indexes for the columns those tables are actually queried by.
--   * Index the unindexed MarketListing/ChatMessage FK + channel columns.
--   * Guild.owner switches RESTRICT -> CASCADE so deleting a founder disbands the
--     guild instead of making the account undeletable.
--   * EscapeRecord (characterId, escapeCount) unique makes prestige escape a
--     one-shot, preventing a concurrent double-escape from doubling the legacy bonus.
--
-- Adding the FKs requires referential integrity, so any pre-existing orphan rows are
-- removed first. On a fresh database these DELETEs match nothing.

-- Clean up orphaned social rows before adding the constraints.
DELETE FROM "FriendRequest" WHERE "fromCharacterId" NOT IN (SELECT "id" FROM "Character") OR "toCharacterId" NOT IN (SELECT "id" FROM "Character");
DELETE FROM "Friendship" WHERE "characterAId" NOT IN (SELECT "id" FROM "Character") OR "characterBId" NOT IN (SELECT "id" FROM "Character");
DELETE FROM "BlockedUser" WHERE "characterId" NOT IN (SELECT "id" FROM "Character") OR "blockedCharacterId" NOT IN (SELECT "id" FROM "Character");

-- DropForeignKey
ALTER TABLE "Guild" DROP CONSTRAINT "Guild_ownerCharacterId_fkey";

-- CreateIndex
CREATE INDEX "MarketListing_itemDefinitionId_idx" ON "MarketListing"("itemDefinitionId");

-- CreateIndex
CREATE INDEX "MarketListing_sellerCharacterId_idx" ON "MarketListing"("sellerCharacterId");

-- CreateIndex
CREATE INDEX "ChatMessage_guildId_createdAt_idx" ON "ChatMessage"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_regionSetId_createdAt_idx" ON "ChatMessage"("regionSetId", "createdAt");

-- CreateIndex
CREATE INDEX "FriendRequest_toCharacterId_idx" ON "FriendRequest"("toCharacterId");

-- CreateIndex
CREATE INDEX "Friendship_characterBId_idx" ON "Friendship"("characterBId");

-- CreateIndex
CREATE INDEX "BlockedUser_blockedCharacterId_idx" ON "BlockedUser"("blockedCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "EscapeRecord_characterId_escapeCount_key" ON "EscapeRecord"("characterId", "escapeCount");

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_fromCharacterId_fkey" FOREIGN KEY ("fromCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_toCharacterId_fkey" FOREIGN KEY ("toCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_characterAId_fkey" FOREIGN KEY ("characterAId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_characterBId_fkey" FOREIGN KEY ("characterBId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockedCharacterId_fkey" FOREIGN KEY ("blockedCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_ownerCharacterId_fkey" FOREIGN KEY ("ownerCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
