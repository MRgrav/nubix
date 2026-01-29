-- CreateEnum
CREATE TYPE "ElectiveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DROPPED');

-- CreateTable
CREATE TABLE "StudentElectiveChoice" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "curriculumSubjectId" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "status" "ElectiveStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "StudentElectiveChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentElectiveChoice_studentId_academicYearId_idx" ON "StudentElectiveChoice"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "StudentElectiveChoice_curriculumSubjectId_idx" ON "StudentElectiveChoice"("curriculumSubjectId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentElectiveChoice_studentId_academicYearId_curriculumSu_key" ON "StudentElectiveChoice"("studentId", "academicYearId", "curriculumSubjectId");

-- AddForeignKey
ALTER TABLE "StudentElectiveChoice" ADD CONSTRAINT "StudentElectiveChoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentElectiveChoice" ADD CONSTRAINT "StudentElectiveChoice_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentElectiveChoice" ADD CONSTRAINT "StudentElectiveChoice_curriculumSubjectId_fkey" FOREIGN KEY ("curriculumSubjectId") REFERENCES "CurriculumSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentElectiveChoice" ADD CONSTRAINT "StudentElectiveChoice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
