-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "streamId" INTEGER;

-- AlterTable
ALTER TABLE "ExamMarks" ADD COLUMN     "internalMarks" INTEGER,
ADD COLUMN     "practicalMarks" INTEGER,
ADD COLUMN     "theoryMarks" INTEGER;

-- CreateIndex
CREATE INDEX "Exam_streamId_idx" ON "Exam"("streamId");

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
