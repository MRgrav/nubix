/*
  Warnings:

  - A unique constraint covering the columns `[studentId,date,academicYearId,subjectId]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Attendance_studentId_date_academicYearId_key";

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "subjectId" INTEGER;

-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN     "isSubjectWiseAttendance" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Attendance_academicYearId_idx" ON "Attendance"("academicYearId");

-- CreateIndex
CREATE INDEX "Attendance_subjectId_idx" ON "Attendance"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_date_academicYearId_subjectId_key" ON "Attendance"("studentId", "date", "academicYearId", "subjectId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
