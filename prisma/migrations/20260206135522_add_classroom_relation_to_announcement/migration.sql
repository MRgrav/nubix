/*
  Warnings:

  - You are about to drop the column `targetClass` on the `Announcement` table. All the data in the column will be lost.
  - You are about to drop the column `targetSection` on the `Announcement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Announcement" DROP COLUMN "targetClass",
DROP COLUMN "targetSection",
ADD COLUMN     "classroomId" INTEGER;

-- CreateIndex
CREATE INDEX "Announcement_classroomId_idx" ON "Announcement"("classroomId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
