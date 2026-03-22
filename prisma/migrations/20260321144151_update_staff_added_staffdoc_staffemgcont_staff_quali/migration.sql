/*
  Warnings:

  - You are about to drop the column `aadhaarCardUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `cancelledChequeUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `experienceLetterUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `fatherHusbandName` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `graduationCertificateUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `hscCertificateUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `jobOfferLetterUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `joiningLetterUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `ndaUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `panCardUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `passportUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `pincode` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `qualification` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `relievingLetterUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `salarySlipUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `sscCertificateUrl` on the `Staff` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `Staff` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Staff" DROP COLUMN "aadhaarCardUrl",
DROP COLUMN "address",
DROP COLUMN "cancelledChequeUrl",
DROP COLUMN "city",
DROP COLUMN "experienceLetterUrl",
DROP COLUMN "fatherHusbandName",
DROP COLUMN "graduationCertificateUrl",
DROP COLUMN "hscCertificateUrl",
DROP COLUMN "jobOfferLetterUrl",
DROP COLUMN "joiningLetterUrl",
DROP COLUMN "location",
DROP COLUMN "ndaUrl",
DROP COLUMN "panCardUrl",
DROP COLUMN "passportUrl",
DROP COLUMN "pincode",
DROP COLUMN "qualification",
DROP COLUMN "relievingLetterUrl",
DROP COLUMN "salarySlipUrl",
DROP COLUMN "sscCertificateUrl",
DROP COLUMN "state",
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "employeeStatus" "EmployeeStatus" DEFAULT 'ACTIVE',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedById" INTEGER;

-- CreateTable
CREATE TABLE "StaffDocument" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT,
    "fileUrl" TEXT NOT NULL,
    "pocketbaseRecordId" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "uploadedById" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffEmergencyContact" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StaffEmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffQualification" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "degree" TEXT NOT NULL,
    "institution" TEXT,
    "yearOfPassing" INTEGER,
    "grade" TEXT,
    "certificateUrl" TEXT,

    CONSTRAINT "StaffQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StaffAddresses" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_StaffAddresses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "StaffDocument_staffId_idx" ON "StaffDocument"("staffId");

-- CreateIndex
CREATE INDEX "StaffDocument_documentType_idx" ON "StaffDocument"("documentType");

-- CreateIndex
CREATE INDEX "StaffEmergencyContact_staffId_idx" ON "StaffEmergencyContact"("staffId");

-- CreateIndex
CREATE INDEX "StaffQualification_staffId_idx" ON "StaffQualification"("staffId");

-- CreateIndex
CREATE INDEX "_StaffAddresses_B_index" ON "_StaffAddresses"("B");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEmergencyContact" ADD CONSTRAINT "StaffEmergencyContact_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffQualification" ADD CONSTRAINT "StaffQualification_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StaffAddresses" ADD CONSTRAINT "_StaffAddresses_A_fkey" FOREIGN KEY ("A") REFERENCES "Address"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StaffAddresses" ADD CONSTRAINT "_StaffAddresses_B_fkey" FOREIGN KEY ("B") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
