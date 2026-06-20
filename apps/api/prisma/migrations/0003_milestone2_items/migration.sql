-- Milestone 2: equipment/inventory depth, consumable effects, structured story
-- preferences, and the AI item-concept validation pipeline. All additive with
-- safe defaults so existing rows backfill without data loss.

-- AlterTable: structured story-style preferences (JSON array of StoryStyleTag).
ALTER TABLE "Character" ADD COLUMN     "storyStyleTags" TEXT NOT NULL DEFAULT '[]';

-- AlterTable: consumable mechanics for item definitions.
ALTER TABLE "ItemDefinition" ADD COLUMN     "consumableEffectPower" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consumableEffectType" TEXT NOT NULL DEFAULT 'none';

-- AlterTable: server-computed validation verdict for AI item concepts.
ALTER TABLE "PendingItemConcept" ADD COLUMN     "autoApprovable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposedPowerBudget" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "proposedStatModifiers" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "validationIssues" TEXT NOT NULL DEFAULT '[]';
