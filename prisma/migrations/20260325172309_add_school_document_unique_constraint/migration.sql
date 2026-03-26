/*
  Warnings:

  - A unique constraint covering the columns `[schoolId,documentType]` on the table `SchoolDocument` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "SchoolDocument_schoolId_documentType_key" ON "SchoolDocument"("schoolId", "documentType");
