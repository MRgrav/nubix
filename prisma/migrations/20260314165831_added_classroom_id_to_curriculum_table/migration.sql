/*
  Warnings:

  - You are about to drop the column `className` on the `CurriculumSubject` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[academicYearId,classroomId,streamId,subjectId]` on the table `CurriculumSubject` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."CurriculumSubject_academicYearId_className_streamId_subject_key";

-- DropIndex
DROP INDEX "public"."CurriculumSubject_className_idx";

-- AlterTable
ALTER TABLE "CurriculumSubject" DROP COLUMN "className",
ADD COLUMN     "classroomId" INTEGER;

-- CreateIndex
CREATE INDEX "CurriculumSubject_classroomId_idx" ON "CurriculumSubject"("classroomId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumSubject_academicYearId_classroomId_streamId_subje_key" ON "CurriculumSubject"("academicYearId", "classroomId", "streamId", "subjectId");

-- AddForeignKey
ALTER TABLE "CurriculumSubject" ADD CONSTRAINT "CurriculumSubject_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
