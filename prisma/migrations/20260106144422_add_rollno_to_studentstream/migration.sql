/*
  Warnings:

  - You are about to drop the column `rollNo` on the `Student` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[academicYearId,classroomId,rollNo]` on the table `StudentStream` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Student_rollNo_key";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "rollNo";

-- AlterTable
ALTER TABLE "StudentStream" ADD COLUMN     "rollNo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudentStream_academicYearId_classroomId_rollNo_key" ON "StudentStream"("academicYearId", "classroomId", "rollNo");
