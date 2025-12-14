/*
  Warnings:

  - The values [STUDENT] on the enum `CreatedRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "PTMStatus" AS ENUM ('pending', 'approved', 'postponed', 'rejected');

-- CreateEnum
CREATE TYPE "PTMMode" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "PTMRole" AS ENUM ('STUDENT', 'STAFF', 'ADMIN');

-- AlterEnum
BEGIN;
CREATE TYPE "CreatedRole_new" AS ENUM ('STAFF', 'ADMIN', 'PRINCIPAL');
ALTER TABLE "Announcement" ALTER COLUMN "createdByRole" TYPE "CreatedRole_new" USING ("createdByRole"::text::"CreatedRole_new");
ALTER TYPE "CreatedRole" RENAME TO "CreatedRole_old";
ALTER TYPE "CreatedRole_new" RENAME TO "CreatedRole";
DROP TYPE "public"."CreatedRole_old";
COMMIT;

-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN     "section" TEXT NOT NULL DEFAULT 'A';

-- CreateTable
CREATE TABLE "PTMRequest" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "class" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "requestedByRole" "PTMRole" NOT NULL,
    "requestedToId" INTEGER NOT NULL,
    "requestedToRole" "PTMRole" NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "requestedTime" TEXT NOT NULL,
    "mode" "PTMMode" NOT NULL DEFAULT 'offline',
    "status" "PTMStatus" NOT NULL DEFAULT 'pending',
    "responseById" INTEGER,
    "responseByRole" "PTMRole",
    "responseDate" TIMESTAMP(3),
    "suggestedDate" TIMESTAMP(3),
    "suggestedTime" TEXT,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PTMRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PTMRequest_studentId_idx" ON "PTMRequest"("studentId");

-- CreateIndex
CREATE INDEX "PTMRequest_requestedById_idx" ON "PTMRequest"("requestedById");

-- CreateIndex
CREATE INDEX "PTMRequest_requestedToId_idx" ON "PTMRequest"("requestedToId");

-- CreateIndex
CREATE INDEX "PTMRequest_status_idx" ON "PTMRequest"("status");

-- CreateIndex
CREATE INDEX "Announcement_schoolId_idx" ON "Announcement"("schoolId");

-- CreateIndex
CREATE INDEX "Announcement_schoolId_type_idx" ON "Announcement"("schoolId", "type");

-- CreateIndex
CREATE INDEX "Announcement_schoolId_isSuspended_idx" ON "Announcement"("schoolId", "isSuspended");

-- AddForeignKey
ALTER TABLE "PTMRequest" ADD CONSTRAINT "PTMRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTMRequest" ADD CONSTRAINT "PTMRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTMRequest" ADD CONSTRAINT "PTMRequest_requestedToId_fkey" FOREIGN KEY ("requestedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTMRequest" ADD CONSTRAINT "PTMRequest_responseById_fkey" FOREIGN KEY ("responseById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
