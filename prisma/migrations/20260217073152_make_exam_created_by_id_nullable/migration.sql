-- DropForeignKey
ALTER TABLE "public"."Exam" DROP CONSTRAINT "Exam_createdById_fkey";

-- AlterTable
ALTER TABLE "Exam" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Exam_termId_idx" ON "Exam"("termId");

-- CreateIndex
CREATE INDEX "Exam_classroomId_idx" ON "Exam"("classroomId");

-- CreateIndex
CREATE INDEX "Exam_subjectId_idx" ON "Exam"("subjectId");

-- CreateIndex
CREATE INDEX "Exam_examDate_idx" ON "Exam"("examDate");

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
