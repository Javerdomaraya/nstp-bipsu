-- CreateIndex
CREATE INDEX IF NOT EXISTS "qualifying_exam_attempt_examId_idx" ON "qualifying_exam_attempt"("examId");

-- AddForeignKey
ALTER TABLE "qualifying_exam_attempt" DROP CONSTRAINT IF EXISTS "qualifying_exam_attempt_userId_fkey";
ALTER TABLE "qualifying_exam_attempt" ADD CONSTRAINT "qualifying_exam_attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifying_exam_attempt" DROP CONSTRAINT IF EXISTS "qualifying_exam_attempt_examId_fkey";
ALTER TABLE "qualifying_exam_attempt" ADD CONSTRAINT "qualifying_exam_attempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
