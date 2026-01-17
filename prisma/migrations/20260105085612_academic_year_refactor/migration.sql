/*
  Warnings:

  - You are about to drop the column `academicYear` on the `TimetableSlot` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[studentId,date,academicYearId]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[staffId,date,academicYearId]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `academicYearId` to the `Assignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `academicYearId` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `academicYearId` to the `Examination` table without a default value. This is not possible if the table is not empty.
  - Added the required column `academicYearId` to the `ExaminationResult` table without a default value. This is not possible if the table is not empty.
  - Added the required column `academicYearId` to the `PTMRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `academicYearId` to the `TimetableSlot` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."TimetableSlot_academicYear_idx";

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "academicYearId" INTEGER;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Examination" ADD COLUMN     "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "ExaminationResult" ADD COLUMN     "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "PTMRequest" ADD COLUMN     "academicYearId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "TimetableSlot" DROP COLUMN "academicYear",
ADD COLUMN     "academicYearId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentStream" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classroomId" INTEGER NOT NULL,
    "streamId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentStream_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_label_key" ON "AcademicYear"("label");

-- CreateIndex
CREATE INDEX "AcademicYear_isActive_idx" ON "AcademicYear"("isActive");

-- CreateIndex
CREATE INDEX "AcademicYear_startDate_endDate_idx" ON "AcademicYear"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Stream_name_key" ON "Stream"("name");

-- CreateIndex
CREATE INDEX "Stream_name_idx" ON "Stream"("name");

-- CreateIndex
CREATE INDEX "StudentStream_studentId_academicYearId_idx" ON "StudentStream"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "StudentStream_classroomId_idx" ON "StudentStream"("classroomId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentStream_academicYearId_studentId_key" ON "StudentStream"("academicYearId", "studentId");

-- CreateIndex
CREATE INDEX "Assignment_classroomId_academicYearId_idx" ON "Assignment"("classroomId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_date_academicYearId_key" ON "Attendance"("studentId", "date", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_staffId_date_academicYearId_key" ON "Attendance"("staffId", "date", "academicYearId");

-- CreateIndex
CREATE INDEX "Examination_academicYearId_idx" ON "Examination"("academicYearId");

-- CreateIndex
CREATE INDEX "ExaminationResult_studentId_academicYearId_idx" ON "ExaminationResult"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "PTMRequest_academicYearId_idx" ON "PTMRequest"("academicYearId");

-- CreateIndex
CREATE INDEX "TimetableSlot_academicYearId_idx" ON "TimetableSlot"("academicYearId");

-- AddForeignKey
ALTER TABLE "StudentStream" ADD CONSTRAINT "StudentStream_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStream" ADD CONSTRAINT "StudentStream_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStream" ADD CONSTRAINT "StudentStream_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStream" ADD CONSTRAINT "StudentStream_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationResult" ADD CONSTRAINT "ExaminationResult_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTMRequest" ADD CONSTRAINT "PTMRequest_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
