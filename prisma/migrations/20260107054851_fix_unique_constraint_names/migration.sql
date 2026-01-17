/*
  Warnings:

  - A unique constraint covering the columns `[teacherId,subjectId,classroomId,academicYearId,streamId]` on the table `TeacherAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignment_base_idx" ON "TeacherAssignment"("teacherId", "subjectId", "classroomId", "academicYearId", "streamId");

-- RenameIndex
ALTER INDEX "TeacherAssignment_teacherId_subjectId_classroomId_academicY_key" RENAME TO "teacher_assignment_full_idx";
