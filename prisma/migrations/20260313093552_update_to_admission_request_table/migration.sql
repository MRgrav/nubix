/*
  Warnings:

  - You are about to drop the column `academicYearId` on the `AdmissionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `classroomId` on the `AdmissionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `sessionYear` on the `AdmissionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `streamId` on the `AdmissionRequest` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."AdmissionRequest" DROP CONSTRAINT "AdmissionRequest_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AdmissionRequest" DROP CONSTRAINT "AdmissionRequest_classroomId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AdmissionRequest" DROP CONSTRAINT "AdmissionRequest_streamId_fkey";

-- DropIndex
DROP INDEX "public"."AdmissionRequest_academicYearId_idx";

-- DropIndex
DROP INDEX "public"."AdmissionRequest_email_academicYearId_key";

-- DropIndex
DROP INDEX "public"."AdmissionRequest_sessionYear_idx";

-- DropIndex
DROP INDEX "public"."AdmissionRequest_status_idx";

-- DropIndex
DROP INDEX "public"."AdmissionRequest_studentId_key";

-- AlterTable
ALTER TABLE "AdmissionRequest" DROP COLUMN "academicYearId",
DROP COLUMN "classroomId",
DROP COLUMN "sessionYear",
DROP COLUMN "streamId";

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_requestedClassroomId_fkey" FOREIGN KEY ("requestedClassroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_requestedStreamId_fkey" FOREIGN KEY ("requestedStreamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
