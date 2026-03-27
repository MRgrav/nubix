/*
  Warnings:

  - You are about to drop the column `media` on the `Announcement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Announcement" DROP COLUMN "media";

-- CreateTable
CREATE TABLE "AnnouncementDocument" (
    "id" SERIAL NOT NULL,
    "announcementId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT,
    "fileUrl" TEXT NOT NULL,
    "pocketbaseRecordId" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "uploadedById" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnouncementDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementDocument_announcementId_idx" ON "AnnouncementDocument"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementDocument_documentType_idx" ON "AnnouncementDocument"("documentType");

-- AddForeignKey
ALTER TABLE "AnnouncementDocument" ADD CONSTRAINT "AnnouncementDocument_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDocument" ADD CONSTRAINT "AnnouncementDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
