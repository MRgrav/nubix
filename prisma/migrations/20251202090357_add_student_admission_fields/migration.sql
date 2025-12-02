-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "admissionDate" TIMESTAMP(3),
ADD COLUMN     "admissionReceiptLink" TEXT,
ADD COLUMN     "admissionReceiptNo" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "monthlyFees" DOUBLE PRECISION,
ADD COLUMN     "previousClass" TEXT,
ADD COLUMN     "previousGrade" TEXT,
ADD COLUMN     "previousSchoolName" TEXT,
ADD COLUMN     "promotedToClass" TEXT,
ADD COLUMN     "totalAdmissionAmount" DOUBLE PRECISION;
