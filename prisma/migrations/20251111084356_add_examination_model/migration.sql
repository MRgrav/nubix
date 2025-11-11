-- CreateEnum
CREATE TYPE "ExaminationStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Examination" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "status" "ExaminationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "classroomId" INTEGER NOT NULL,

    CONSTRAINT "Examination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExaminationResult" (
    "id" SERIAL NOT NULL,
    "marksObtained" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "examinationId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,

    CONSTRAINT "ExaminationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Examination_schoolId_idx" ON "Examination"("schoolId");

-- CreateIndex
CREATE INDEX "Examination_classroomId_idx" ON "Examination"("classroomId");

-- CreateIndex
CREATE INDEX "Examination_examDate_idx" ON "Examination"("examDate");

-- CreateIndex
CREATE INDEX "ExaminationResult_studentId_idx" ON "ExaminationResult"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExaminationResult_examinationId_studentId_key" ON "ExaminationResult"("examinationId", "studentId");

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationResult" ADD CONSTRAINT "ExaminationResult_examinationId_fkey" FOREIGN KEY ("examinationId") REFERENCES "Examination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationResult" ADD CONSTRAINT "ExaminationResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
