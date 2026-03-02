/*
  Warnings:

  - You are about to drop the column `examConfigId` on the `ExamTerm` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."ExamTerm" DROP CONSTRAINT "ExamTerm_examConfigId_fkey";

-- DropIndex
DROP INDEX "public"."ExamTerm_createdById_idx";

-- DropIndex
DROP INDEX "public"."ExamTerm_updatedById_idx";

-- AlterTable
ALTER TABLE "ExamConfig" ADD COLUMN     "defaultForStreamId" INTEGER,
ADD COLUMN     "defaultForSubjectId" INTEGER;

-- AlterTable
ALTER TABLE "ExamTerm" DROP COLUMN "examConfigId";
