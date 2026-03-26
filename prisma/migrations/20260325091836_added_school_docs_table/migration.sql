-- CreateTable
CREATE TABLE "SchoolDocument" (
    "id" SERIAL NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT,
    "fileUrl" TEXT NOT NULL,
    "pocketbaseRecordId" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "uploadedById" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolDocument_schoolId_idx" ON "SchoolDocument"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolDocument_documentType_idx" ON "SchoolDocument"("documentType");

-- AddForeignKey
ALTER TABLE "SchoolDocument" ADD CONSTRAINT "SchoolDocument_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDocument" ADD CONSTRAINT "SchoolDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
