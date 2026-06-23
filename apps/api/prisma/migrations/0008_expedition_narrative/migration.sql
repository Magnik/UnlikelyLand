-- Expedition narrative framing (story coherence pass):
--   * premise / goal: a one-time scene-set + objective, templated per expedition
--     type with the locked region interpolated. Injected into every step's prompt
--     and shown to the player as a quest header so a run reads as one story.
--   * regionName: the single region locked for the whole expedition (previously the
--     region rotated every step, which made places feel disconnected).
-- All nullable so in-flight expeditions created before this migration keep working
-- (the generator falls back to per-step region rotation when regionName is null).

ALTER TABLE "Expedition" ADD COLUMN "premise" TEXT;
ALTER TABLE "Expedition" ADD COLUMN "goal" TEXT;
ALTER TABLE "Expedition" ADD COLUMN "regionName" TEXT;
