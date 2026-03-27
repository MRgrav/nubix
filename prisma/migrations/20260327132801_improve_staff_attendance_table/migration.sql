/*
  Warnings:

  - You are about to drop the column `date` on the `StaffAttendance` table. All the data in the column will be lost.
  - Added the required column `attendanceDate` to the `StaffAttendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dateOnly` to the `StaffAttendance` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."StaffAttendance_date_idx";

-- DropIndex
DROP INDEX "public"."StaffAttendance_staffId_date_idx";

-- AlterTable
ALTER TABLE "StaffAttendance" DROP COLUMN "date",
ADD COLUMN     "attendanceDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "dateOnly" DATE NOT NULL,
ADD COLUMN     "timeOnly" TEXT;

-- CreateIndex
CREATE INDEX "StaffAttendance_staffId_attendanceDate_idx" ON "StaffAttendance"("staffId", "attendanceDate");

-- CreateIndex
CREATE INDEX "StaffAttendance_dateOnly_idx" ON "StaffAttendance"("dateOnly");

-- CreateIndex
CREATE INDEX "StaffAttendance_staffId_dateOnly_idx" ON "StaffAttendance"("staffId", "dateOnly");
