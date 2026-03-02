/*
  Warnings:

  - A unique constraint covering the columns `[examId,studentId]` on the table `ExamMarks` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ExamMarks_examId_studentId_key" ON "ExamMarks"("examId", "studentId");
