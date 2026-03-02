-- AlterTable
ALTER TABLE "ExamTerm" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExamTerm_isPublished_idx" ON "ExamTerm"("isPublished");

-- CreateIndex
CREATE INDEX "ExamTerm_isLocked_idx" ON "ExamTerm"("isLocked");
