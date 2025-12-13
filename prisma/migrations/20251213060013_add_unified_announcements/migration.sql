/*
  Warnings:

  - You are about to drop the column `section` on the `Classroom` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('notice', 'event');

-- CreateEnum
CREATE TYPE "CreatedRole" AS ENUM ('STAFF', 'ADMIN', 'STUDENT');

-- AlterTable
ALTER TABLE "Classroom" DROP COLUMN "section";

-- CreateTable
CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "type" "AnnouncementType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "link" TEXT,
    "media" TEXT,
    "targetClass" TEXT,
    "targetSection" TEXT,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdByRole" "CreatedRole" NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
