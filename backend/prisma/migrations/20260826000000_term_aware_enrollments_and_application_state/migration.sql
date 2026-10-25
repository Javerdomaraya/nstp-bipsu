-- AlterTable enrollment
ALTER TABLE "enrollment"
  ADD COLUMN IF NOT EXISTS "schoolYear" TEXT,
  ADD COLUMN IF NOT EXISTS "semester" TEXT;

-- AlterTable component_application_state
ALTER TABLE "component_application_state"
  ADD COLUMN IF NOT EXISTS "schoolYear" TEXT,
  ADD COLUMN IF NOT EXISTS "semester" TEXT;

-- Backfill enrollment.schoolYear and enrollment.semester from linked section
UPDATE "enrollment" e
SET "schoolYear" = s."schoolYear",
    "semester"   = s."semester"
FROM "section" s
WHERE e."sectionId" = s."id"
  AND (e."schoolYear" IS NULL OR e."semester" IS NULL);

-- Backfill unsectioned enrollments from active component_application_state
UPDATE "enrollment" e
SET "schoolYear" = COALESCE(cas."schoolYear", '2025-2026'),
    "semester"   = COALESCE(cas."semester", 'FIRST')
FROM "component_application_state" cas
WHERE e."schoolYear" IS NULL OR e."semester" IS NULL;

-- Fallback for any remaining without app_state
UPDATE "enrollment"
SET "schoolYear" = '2025-2026',
    "semester"   = 'FIRST'
WHERE "schoolYear" IS NULL OR "semester" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "enrollment_schoolYear_semester_idx" ON "enrollment"("schoolYear", "semester");

-- Unique constraint for student enrollment per term
ALTER TABLE "enrollment" DROP CONSTRAINT IF EXISTS "enrollment_studentId_componentId_schoolYear_semester_key";
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_studentId_componentId_schoolYear_semester_key" UNIQUE ("studentId", "componentId", "schoolYear", "semester");
