/*
  Warnings:

  - Added the required column `academicYearId` to the `GradingScheme` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GradingScheme" ADD COLUMN     "academicYearId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "GradingScheme_academicYearId_idx" ON "GradingScheme"("academicYearId");

-- AddForeignKey
ALTER TABLE "GradingScheme" ADD CONSTRAINT "GradingScheme_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
