/*
  Warnings:

  - You are about to drop the `Examination` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExaminationResult` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "public"."Examination" DROP CONSTRAINT "Examination_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Examination" DROP CONSTRAINT "Examination_classroomId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Examination" DROP CONSTRAINT "Examination_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ExaminationResult" DROP CONSTRAINT "ExaminationResult_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ExaminationResult" DROP CONSTRAINT "ExaminationResult_examinationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ExaminationResult" DROP CONSTRAINT "ExaminationResult_studentId_fkey";

-- DropTable
DROP TABLE "public"."Examination";

-- DropTable
DROP TABLE "public"."ExaminationResult";

-- DropEnum
DROP TYPE "public"."ExaminationStatus";

-- CreateTable
CREATE TABLE "Board" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schoolId" INTEGER,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamConfig" (
    "id" SERIAL NOT NULL,
    "boardId" INTEGER NOT NULL,
    "termName" TEXT NOT NULL,
    "weightage" DOUBLE PRECISION NOT NULL,
    "carryForward" BOOLEAN NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "passMarks" INTEGER NOT NULL,
    "subjectId" INTEGER,
    "gradingSchemeId" INTEGER,
    "staffId" INTEGER,

    CONSTRAINT "ExamConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingScheme" (
    "id" SERIAL NOT NULL,
    "boardId" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "minPercent" DOUBLE PRECISION NOT NULL,
    "maxPercent" DOUBLE PRECISION NOT NULL,
    "formula" TEXT,

    CONSTRAINT "GradingScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamTerm" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "configId" INTEGER NOT NULL,

    CONSTRAINT "ExamTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" SERIAL NOT NULL,
    "termId" INTEGER NOT NULL,
    "classroomId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "venue" TEXT,
    "maxMarks" INTEGER NOT NULL,
    "passMarks" INTEGER NOT NULL,
    "carryForward" BOOLEAN NOT NULL DEFAULT false,
    "isSupplementary" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamMarks" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "marksObtained" INTEGER NOT NULL,
    "remarks" TEXT,
    "enteredById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamMarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamResult" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "termId" INTEGER NOT NULL,
    "totalMarks" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "grade" TEXT,
    "remarks" TEXT,
    "updatedById" INTEGER,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Board_name_key" ON "Board"("name");

-- CreateIndex
CREATE INDEX "Board_schoolId_idx" ON "Board"("schoolId");

-- CreateIndex
CREATE INDEX "ExamConfig_subjectId_idx" ON "ExamConfig"("subjectId");

-- CreateIndex
CREATE INDEX "GradingScheme_boardId_idx" ON "GradingScheme"("boardId");

-- CreateIndex
CREATE INDEX "ExamMarks_studentId_examId_idx" ON "ExamMarks"("studentId", "examId");

-- CreateIndex
CREATE INDEX "ExamMarks_enteredById_idx" ON "ExamMarks"("enteredById");

-- CreateIndex
CREATE INDEX "ExamMarks_updatedById_idx" ON "ExamMarks"("updatedById");

-- CreateIndex
CREATE INDEX "ExamResult_studentId_termId_idx" ON "ExamResult"("studentId", "termId");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_gradingSchemeId_fkey" FOREIGN KEY ("gradingSchemeId") REFERENCES "GradingScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingScheme" ADD CONSTRAINT "GradingScheme_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTerm" ADD CONSTRAINT "ExamTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTerm" ADD CONSTRAINT "ExamTerm_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ExamConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_termId_fkey" FOREIGN KEY ("termId") REFERENCES "ExamTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarks" ADD CONSTRAINT "ExamMarks_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarks" ADD CONSTRAINT "ExamMarks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarks" ADD CONSTRAINT "ExamMarks_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarks" ADD CONSTRAINT "ExamMarks_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_termId_fkey" FOREIGN KEY ("termId") REFERENCES "ExamTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
