-- Milestone 3: multiplayer/social completion + moderation. All additive with
-- safe defaults (NULL or DEFAULT) so existing rows backfill without data loss.

-- AlterTable: User moderation/ban state.
ALTER TABLE "User" ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "bannedReason" TEXT;

-- AlterTable: Character social/moderation state + combat-victory counter.
ALTER TABLE "Character" ADD COLUMN     "combatVictories" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "mutedUntil" TIMESTAMP(3),
ADD COLUMN     "warningCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hiddenFromLeaderboards" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: ChatMessage channel routing + moderation status.
ALTER TABLE "ChatMessage" ADD COLUMN     "channelType" TEXT NOT NULL DEFAULT 'global',
ADD COLUMN     "regionSetId" TEXT,
ADD COLUMN     "guildId" TEXT,
ADD COLUMN     "moderationStatus" TEXT NOT NULL DEFAULT 'visible',
ADD COLUMN     "reportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: MailMessage moderation status.
ALTER TABLE "MailMessage" ADD COLUMN     "moderationStatus" TEXT NOT NULL DEFAULT 'visible',
ADD COLUMN     "reportCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Guild clan tag.
ALTER TABLE "Guild" ADD COLUMN     "tag" TEXT;

-- CreateIndex: Character combat-victory leaderboard.
CREATE INDEX "Character_combatVictories_idx" ON "Character"("combatVictories");

-- CreateIndex: ChatMessage channel/moderation feed.
CREATE INDEX "ChatMessage_channelType_moderationStatus_createdAt_idx" ON "ChatMessage"("channelType", "moderationStatus", "createdAt");

-- CreateIndex: unique guild tag (NULLs allowed and treated as distinct).
CREATE UNIQUE INDEX "Guild_tag_key" ON "Guild"("tag");

-- CreateTable: MessageReport (player-filed reports).
CREATE TABLE "MessageReport" (
    "id" TEXT NOT NULL,
    "reporterCharacterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetMessageId" TEXT,
    "targetCharacterId" TEXT,
    "targetGuildId" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageReport_reporterCharacterId_targetType_targetMessageId_key" ON "MessageReport"("reporterCharacterId", "targetType", "targetMessageId");

-- CreateIndex
CREATE INDEX "MessageReport_status_createdAt_idx" ON "MessageReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MessageReport_targetCharacterId_idx" ON "MessageReport"("targetCharacterId");

-- AddForeignKey
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_reporterCharacterId_fkey" FOREIGN KEY ("reporterCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ModerationAction (append-only audit trail).
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "moderatorUserId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT '',
    "targetCharacterId" TEXT,
    "targetMessageId" TEXT,
    "targetGuildId" TEXT,
    "targetReportId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationAction_createdAt_idx" ON "ModerationAction"("createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_targetCharacterId_idx" ON "ModerationAction"("targetCharacterId");

-- CreateIndex
CREATE INDEX "ModerationAction_moderatorUserId_idx" ON "ModerationAction"("moderatorUserId");

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderatorUserId_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ActivityEvent (public world feed).
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_characterId_createdAt_idx" ON "ActivityEvent"("characterId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
