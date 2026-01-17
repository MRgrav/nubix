/*
  Warnings:

  - The primary key for the `StudentParent` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[studentId,parentId]` on the table `StudentParent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "ParentType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "StudentParent" DROP CONSTRAINT "StudentParent_pkey";

-- CreateIndex
CREATE UNIQUE INDEX "StudentParent_studentId_parentId_key" ON "StudentParent"("studentId", "parentId");
