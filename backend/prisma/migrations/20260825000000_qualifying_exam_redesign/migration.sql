-- AlterTable qualifying_exam_result
ALTER TABLE "qualifying_exam_result"
  ADD COLUMN IF NOT EXISTS "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);

-- CreateTable qualifying_exam_attempt
CREATE TABLE IF NOT EXISTS "qualifying_exam_attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "userEmail" TEXT,
    "examId" TEXT,
    "preferredComponent" TEXT NOT NULL,
    "score" INTEGER,
    "answers" JSONB,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "assignedComponent" TEXT,
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qualifying_exam_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "qualifying_exam_attempt_userId_idx" ON "qualifying_exam_attempt"("userId");
CREATE INDEX IF NOT EXISTS "qualifying_exam_attempt_examId_idx" ON "qualifying_exam_attempt"("examId");
CREATE INDEX IF NOT EXISTS "qualifying_exam_attempt_preferredComponent_idx" ON "qualifying_exam_attempt"("preferredComponent");
CREATE INDEX IF NOT EXISTS "qualifying_exam_attempt_status_idx" ON "qualifying_exam_attempt"("status");

-- AddForeignKey
ALTER TABLE "qualifying_exam_attempt" ADD CONSTRAINT "qualifying_exam_attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifying_exam_attempt" ADD CONSTRAINT "qualifying_exam_attempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
