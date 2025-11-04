/*
  Warnings:

  - You are about to drop the column `year` on the `Classroom` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Classroom" DROP COLUMN "year";

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "schoolId" INTEGER;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
