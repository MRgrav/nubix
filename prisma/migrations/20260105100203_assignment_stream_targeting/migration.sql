-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "streamId" INTEGER,
ADD COLUMN     "targetClass" TEXT,
ADD COLUMN     "targetSection" TEXT;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
