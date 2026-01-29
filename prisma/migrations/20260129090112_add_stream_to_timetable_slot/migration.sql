-- AlterTable
ALTER TABLE "TimetableSlot" ADD COLUMN     "streamId" INTEGER;

-- CreateIndex
CREATE INDEX "TimetableSlot_streamId_idx" ON "TimetableSlot"("streamId");

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
