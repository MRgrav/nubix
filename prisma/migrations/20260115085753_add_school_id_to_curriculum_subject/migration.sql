/*
  Warnings:

  - Added the required column `schoolId` to the `CurriculumSubject` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CurriculumSubject" ADD COLUMN     "schoolId" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "CurriculumSubject" ADD CONSTRAINT "CurriculumSubject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
