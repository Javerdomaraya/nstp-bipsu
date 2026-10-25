-- AlterTable enrollment
ALTER TABLE "enrollment"
  ADD COLUMN IF NOT EXISTS "schoolYear" TEXT,
  ADD COLUMN IF NOT EXISTS "semester" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "enrollment_schoolYear_semester_idx" ON "enrollment"("schoolYear", "semester");

-- AlterTable component_application_state
ALTER TABLE "component_application_state"
  ADD COLUMN IF NOT EXISTS "schoolYear" TEXT,
  ADD COLUMN IF NOT EXISTS "semester" TEXT;
