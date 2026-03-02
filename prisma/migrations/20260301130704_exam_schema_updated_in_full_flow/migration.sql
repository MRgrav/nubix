/*
  Warnings:

  - A unique constraint covering the columns `[name,schoolId]` on the table `Board` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[termId,classroomId,subjectId,streamId]` on the table `Exam` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[boardId,academicYearId,subjectId,termName]` on the table `ExamConfig` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[academicYearId,configId]` on the table `ExamTerm` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Board` table without a default value. This is not possible if the table is not empty.
  - Added the required column `academicYearId` to the `ExamConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ExamConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ExamTerm` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Board_name_key";

-- DropIndex
DROP INDEX "public"."Exam_createdById_idx";

-- DropIndex
DROP INDEX "public"."Exam_updatedById_idx";

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "ExamConfig" ADD COLUMN     "academicYearId" INTEGER NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "carryForward" SET DEFAULT false;

-- AlterTable
ALTER TABLE "ExamMarks" ADD COLUMN     "internalPass" BOOLEAN DEFAULT false,
ADD COLUMN     "overallPass" BOOLEAN DEFAULT false,
ADD COLUMN     "practicalPass" BOOLEAN DEFAULT false,
ADD COLUMN     "theoryPass" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "ExamResult" ADD COLUMN     "calculationRemarks" TEXT,
ADD COLUMN     "calculationVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isComplete" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "ExamTerm" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedById" INTEGER;

-- CreateTable
CREATE TABLE "BoardVersion" (
    "id" SERIAL NOT NULL,
    "boardId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardVersion_academicYearId_idx" ON "BoardVersion"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardVersion_boardId_academicYearId_key" ON "BoardVersion"("boardId", "academicYearId");

-- CreateIndex
CREATE INDEX "Board_isDeleted_idx" ON "Board"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Board_name_schoolId_key" ON "Board"("name", "schoolId");

-- CreateIndex
CREATE INDEX "Exam_status_idx" ON "Exam"("status");

-- CreateIndex
CREATE INDEX "Exam_examDate_idx" ON "Exam"("examDate");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_termId_classroomId_subjectId_streamId_key" ON "Exam"("termId", "classroomId", "subjectId", "streamId");

-- CreateIndex
CREATE INDEX "ExamConfig_academicYearId_idx" ON "ExamConfig"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamConfig_boardId_academicYearId_subjectId_termName_key" ON "ExamConfig"("boardId", "academicYearId", "subjectId", "termName");

-- CreateIndex
CREATE INDEX "ExamResult_isComplete_idx" ON "ExamResult"("isComplete");

-- CreateIndex
CREATE INDEX "ExamTerm_academicYearId_idx" ON "ExamTerm"("academicYearId");

-- CreateIndex
CREATE INDEX "ExamTerm_configId_idx" ON "ExamTerm"("configId");

-- CreateIndex
CREATE INDEX "ExamTerm_isDeleted_idx" ON "ExamTerm"("isDeleted");

-- CreateIndex
CREATE INDEX "ExamTerm_createdById_idx" ON "ExamTerm"("createdById");

-- CreateIndex
CREATE INDEX "ExamTerm_updatedById_idx" ON "ExamTerm"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "ExamTerm_academicYearId_configId_key" ON "ExamTerm"("academicYearId", "configId");

-- AddForeignKey
ALTER TABLE "BoardVersion" ADD CONSTRAINT "BoardVersion_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardVersion" ADD CONSTRAINT "BoardVersion_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTerm" ADD CONSTRAINT "ExamTerm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTerm" ADD CONSTRAINT "ExamTerm_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
