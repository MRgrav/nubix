-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateTable
CREATE TABLE "AdmissionRequest" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "previousSchoolName" TEXT,
    "previousClass" TEXT,
    "previousGrade" TEXT,
    "promotedToClass" TEXT,
    "totalAdmissionAmount" DOUBLE PRECISION,
    "monthlyFees" DOUBLE PRECISION,
    "admissionDate" TIMESTAMP(3),
    "admissionReceiptNo" TEXT,
    "admissionReceiptLink" TEXT,
    "parents" JSONB,
    "electiveSubjects" JSONB,
    "requestedClassroomId" INTEGER,
    "requestedStreamId" INTEGER,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "schoolId" INTEGER NOT NULL,
    "academicYearId" INTEGER,
    "createdById" INTEGER,
    "approvedById" INTEGER,
    "studentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionRequest_email_key" ON "AdmissionRequest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionRequest_studentId_key" ON "AdmissionRequest"("studentId");

-- CreateIndex
CREATE INDEX "AdmissionRequest_schoolId_status_idx" ON "AdmissionRequest"("schoolId", "status");

-- CreateIndex
CREATE INDEX "AdmissionRequest_academicYearId_idx" ON "AdmissionRequest"("academicYearId");

-- CreateIndex
CREATE INDEX "AdmissionRequest_status_idx" ON "AdmissionRequest"("status");

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
