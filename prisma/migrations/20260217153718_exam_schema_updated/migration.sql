/*
  Warnings:

  - You are about to drop the column `staffId` on the `ExamConfig` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Exam" DROP CONSTRAINT "Exam_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."ExamConfig" DROP CONSTRAINT "ExamConfig_staffId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ExamMarks" DROP CONSTRAINT "ExamMarks_enteredById_fkey";

-- DropForeignKey
ALTER TABLE "public"."ExamMarks" DROP CONSTRAINT "ExamMarks_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."ExamResult" DROP CONSTRAINT "ExamResult_updatedById_fkey";

-- DropIndex
DROP INDEX "public"."Exam_examDate_idx";

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "updatedById" INTEGER;

-- AlterTable
ALTER TABLE "ExamConfig" DROP COLUMN "staffId",
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedById" INTEGER;

-- AlterTable
ALTER TABLE "ExamResult" ADD COLUMN     "calculatedById" INTEGER;

-- AlterTable
ALTER TABLE "GradingScheme" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedById" INTEGER;

-- CreateIndex
CREATE INDEX "Exam_createdById_idx" ON "Exam"("createdById");

-- CreateIndex
CREATE INDEX "Exam_updatedById_idx" ON "Exam"("updatedById");

-- CreateIndex
CREATE INDEX "ExamConfig_createdById_idx" ON "ExamConfig"("createdById");

-- CreateIndex
CREATE INDEX "ExamConfig_updatedById_idx" ON "ExamConfig"("updatedById");

-- CreateIndex
CREATE INDEX "ExamResult_updatedById_idx" ON "ExamResult"("updatedById");

-- CreateIndex
CREATE INDEX "GradingScheme_createdById_idx" ON "GradingScheme"("createdById");

-- CreateIndex
CREATE INDEX "GradingScheme_updatedById_idx" ON "GradingScheme"("updatedById");

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingScheme" ADD CONSTRAINT "GradingScheme_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingScheme" ADD CONSTRAINT "GradingScheme_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarks" ADD CONSTRAINT "ExamMarks_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarks" ADD CONSTRAINT "ExamMarks_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_calculatedById_fkey" FOREIGN KEY ("calculatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
