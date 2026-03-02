/*
  Warnings:

  - You are about to drop the column `termName` on the `ExamConfig` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."ExamConfig_boardId_academicYearId_subjectId_termName_key";

-- DropIndex
DROP INDEX "public"."ExamConfig_createdById_idx";

-- DropIndex
DROP INDEX "public"."ExamConfig_subjectId_idx";

-- DropIndex
DROP INDEX "public"."ExamConfig_updatedById_idx";

-- AlterTable
ALTER TABLE "ExamConfig" DROP COLUMN "termName",
ADD COLUMN     "name" TEXT,
ALTER COLUMN "maxMarks" DROP NOT NULL,
ALTER COLUMN "passMarks" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ExamConfig_boardId_idx" ON "ExamConfig"("boardId");

-- CreateIndex
CREATE INDEX "ExamConfig_gradingSchemeId_idx" ON "ExamConfig"("gradingSchemeId");

-- CreateIndex
CREATE INDEX "ExamConfig_isDeleted_idx" ON "ExamConfig"("isDeleted");
