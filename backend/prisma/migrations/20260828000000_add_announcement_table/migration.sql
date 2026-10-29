-- CreateTable
CREATE TABLE IF NOT EXISTS "announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "announcement_audience_idx" ON "announcement"("audience");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "announcement_createdBy_idx" ON "announcement"("createdBy");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'announcement_createdBy_fkey'
    ) THEN
        ALTER TABLE "announcement" ADD CONSTRAINT "announcement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
