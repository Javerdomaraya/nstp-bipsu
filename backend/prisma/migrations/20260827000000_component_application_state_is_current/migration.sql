-- AlterTable
ALTER TABLE "component_application_state" ADD COLUMN IF NOT EXISTS "isCurrent" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: Partial unique index guaranteeing at most one row can have isCurrent = true
CREATE UNIQUE INDEX IF NOT EXISTS "component_application_state_is_current_unique"
ON "component_application_state" ("isCurrent")
WHERE "isCurrent" = true;
