-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "streamId" INTEGER;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
