/*
  Warnings:

  - A unique constraint covering the columns `[staffId,dateOnly]` on the table `StaffAttendance` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."StaffAttendance_staffId_attendanceDate_idx";

-- AlterTable
ALTER TABLE "StaffAttendance" ALTER COLUMN "attendanceDate" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_staffId_dateOnly_key" ON "StaffAttendance"("staffId", "dateOnly");
