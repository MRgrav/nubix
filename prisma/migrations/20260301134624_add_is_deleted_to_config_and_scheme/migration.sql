/*
  Warnings:

  - Added the required column `updatedAt` to the `GradingScheme` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ExamConfig" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GradingScheme" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
