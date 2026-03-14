/*
  Warnings:

  - You are about to drop the column `admissionDate` on the `AdmissionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `AdmissionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `promotedToClass` on the `AdmissionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `AdmissionRequest` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[applicationNo]` on the table `AdmissionRequest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,academicYearId]` on the table `AdmissionRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AdmissionDocumentType" AS ENUM ('ADMISSION_FORM', 'PHOTO', 'MARKSHEET_PREV_CLASS', 'TRANSFER_CERTIFICATE', 'AADHAAR_CARD', 'BIRTH_CERTIFICATE', 'RECEIPT_ADMISSION_FEE', 'OTHER_CERTIFICATE', 'OTHER_DOCUMENT');

-- CreateEnum
CREATE TYPE "AdmissionCategory" AS ENUM ('GENERAL', 'SC', 'ST', 'OBC', 'EWS', 'OTHER');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('CURRENT', 'PERMANENT', 'CORRESPONDENCE', 'OFFICE', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdmissionStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "AdmissionStatus" ADD VALUE 'SHORTLISTED';
ALTER TYPE "AdmissionStatus" ADD VALUE 'WAITLISTED';

-- DropForeignKey
ALTER TABLE "public"."AdmissionRequest" DROP CONSTRAINT "AdmissionRequest_requestedClassroomId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AdmissionRequest" DROP CONSTRAINT "AdmissionRequest_requestedStreamId_fkey";

-- DropIndex
DROP INDEX "public"."AdmissionRequest_email_key";

-- AlterTable
ALTER TABLE "AdmissionRequest" DROP COLUMN "admissionDate",
DROP COLUMN "createdAt",
DROP COLUMN "promotedToClass",
DROP COLUMN "updatedAt",
ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "admissionForClass" TEXT,
ADD COLUMN     "applicationNo" TEXT,
ADD COLUMN     "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "category" "AdmissionCategory",
ADD COLUMN     "classroomId" INTEGER,
ADD COLUMN     "currentAddressId" INTEGER,
ADD COLUMN     "fullMarksInPrevClass" INTEGER,
ADD COLUMN     "hasSiblingInSchool" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isReAdmission" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isStaffWard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permanentAddressId" INTEGER,
ADD COLUMN     "permanentEducationNumber" TEXT,
ADD COLUMN     "previousSchoolAddress" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "sessionYear" TEXT DEFAULT '',
ADD COLUMN     "streamId" INTEGER,
ADD COLUMN     "totalMarksObtainedInPrevClass" INTEGER,
ADD COLUMN     "totalSubjectsInPrevClass" INTEGER;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "currentAddressId" INTEGER,
ADD COLUMN     "permanentAddressId" INTEGER;

-- CreateTable
CREATE TABLE "AdmissionDocument" (
    "id" SERIAL NOT NULL,
    "documentType" "AdmissionDocumentType" NOT NULL,
    "title" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" INTEGER,
    "admissionRequestId" INTEGER NOT NULL,

    CONSTRAINT "AdmissionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" SERIAL NOT NULL,
    "houseNo" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "state" TEXT NOT NULL,
    "pinCode" TEXT NOT NULL,
    "postOffice" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "addressType" "AddressType" NOT NULL DEFAULT 'CURRENT',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdmissionDocument_admissionRequestId_idx" ON "AdmissionDocument"("admissionRequestId");

-- CreateIndex
CREATE INDEX "AdmissionDocument_documentType_idx" ON "AdmissionDocument"("documentType");

-- CreateIndex
CREATE INDEX "AdmissionDocument_uploadedAt_idx" ON "AdmissionDocument"("uploadedAt");

-- CreateIndex
CREATE INDEX "Address_pinCode_idx" ON "Address"("pinCode");

-- CreateIndex
CREATE INDEX "Address_city_state_idx" ON "Address"("city", "state");

-- CreateIndex
CREATE INDEX "Address_addressType_idx" ON "Address"("addressType");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionRequest_applicationNo_key" ON "AdmissionRequest"("applicationNo");

-- CreateIndex
CREATE INDEX "AdmissionRequest_email_idx" ON "AdmissionRequest"("email");

-- CreateIndex
CREATE INDEX "AdmissionRequest_isArchived_idx" ON "AdmissionRequest"("isArchived");

-- CreateIndex
CREATE INDEX "AdmissionRequest_sessionYear_idx" ON "AdmissionRequest"("sessionYear");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionRequest_email_academicYearId_key" ON "AdmissionRequest"("email", "academicYearId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_currentAddressId_fkey" FOREIGN KEY ("currentAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_permanentAddressId_fkey" FOREIGN KEY ("permanentAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_currentAddressId_fkey" FOREIGN KEY ("currentAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_permanentAddressId_fkey" FOREIGN KEY ("permanentAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionDocument" ADD CONSTRAINT "AdmissionDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionDocument" ADD CONSTRAINT "AdmissionDocument_admissionRequestId_fkey" FOREIGN KEY ("admissionRequestId") REFERENCES "AdmissionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
