/*
  Warnings:

  - A unique constraint covering the columns `[studentId,termId]` on the table `ExamResult` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ExamResult_studentId_termId_key" ON "ExamResult"("studentId", "termId");
