/*
  Warnings:

  - You are about to drop the `_ClassroomToStudent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."_ClassroomToStudent" DROP CONSTRAINT "_ClassroomToStudent_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_ClassroomToStudent" DROP CONSTRAINT "_ClassroomToStudent_B_fkey";

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "classroomId" INTEGER;

-- DropTable
DROP TABLE "public"."_ClassroomToStudent";

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
