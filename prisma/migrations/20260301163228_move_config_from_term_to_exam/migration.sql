/*
  Warnings:

  - You are about to drop the column `configId` on the `ExamTerm` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[academicYearId,termName]` on the table `ExamTerm` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."ExamTerm" DROP CONSTRAINT "ExamTerm_configId_fkey";

-- DropIndex
DROP INDEX "public"."ExamTerm_academicYearId_configId_key";

-- DropIndex
DROP INDEX "public"."ExamTerm_configId_idx";

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "configId" INTEGER;

-- AlterTable
ALTER TABLE "ExamTerm" DROP COLUMN "configId",
ADD COLUMN     "examConfigId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "ExamTerm_academicYearId_termName_key" ON "ExamTerm"("academicYearId", "termName");

-- AddForeignKey
ALTER TABLE "ExamTerm" ADD CONSTRAINT "ExamTerm_examConfigId_fkey" FOREIGN KEY ("examConfigId") REFERENCES "ExamConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ExamConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
