/*
  Warnings:

  - You are about to drop the `alumni_profiles` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `dateOfBirth` to the `alumni_submissions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AlumniSubmissionType" AS ENUM ('INITIAL', 'UPDATE');

-- AlterTable
ALTER TABLE "alumni_submissions" ADD COLUMN     "alumniProfileId" INTEGER,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "type" "AlumniSubmissionType" NOT NULL DEFAULT 'INITIAL';

-- DropTable
DROP TABLE "public"."alumni_profiles";

-- CreateTable
CREATE TABLE "AlumniProfile" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "graduationYear" INTEGER NOT NULL,
    "course" TEXT NOT NULL,
    "currentStatus" TEXT NOT NULL,
    "organization" TEXT,
    "designation" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlumniProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlumniProfile_email_key" ON "AlumniProfile"("email");

-- AddForeignKey
ALTER TABLE "alumni_submissions" ADD CONSTRAINT "alumni_submissions_alumniProfileId_fkey" FOREIGN KEY ("alumniProfileId") REFERENCES "AlumniProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
