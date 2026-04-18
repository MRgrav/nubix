-- AlterTable
ALTER TABLE "Homework" ADD COLUMN     "description" TEXT,
ADD COLUMN     "targetClass" TEXT,
ADD COLUMN     "streamId" INTEGER;

-- CreateIndex
CREATE INDEX "Homework_streamId_idx" ON "Homework"("streamId");

-- CreateIndex
CREATE INDEX "Homework_targetClass_idx" ON "Homework"("targetClass");

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
