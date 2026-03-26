/*
  Warnings:

  - A unique constraint covering the columns `[staffId,documentType]` on the table `StaffDocument` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AdmissionRequest" ADD COLUMN     "requestedForStream" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffDocument_staffId_documentType_key" ON "StaffDocument"("staffId", "documentType");
