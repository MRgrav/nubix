/*
  Warnings:

  - You are about to drop the column `applicableClasses` on the `Subject` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Subject` table. All the data in the column will be lost.
  - You are about to drop the `SubjectClassRelation` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CurriculumCategory" AS ENUM ('CORE', 'ELECTIVE', 'ACTIVITY');

-- DropForeignKey
ALTER TABLE "public"."SubjectClassRelation" DROP CONSTRAINT "SubjectClassRelation_classroomId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SubjectClassRelation" DROP CONSTRAINT "SubjectClassRelation_streamId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SubjectClassRelation" DROP CONSTRAINT "SubjectClassRelation_subjectId_fkey";

-- AlterTable
ALTER TABLE "Subject" DROP COLUMN "applicableClasses",
DROP COLUMN "type";

-- DropTable
DROP TABLE "public"."SubjectClassRelation";

-- DropEnum
DROP TYPE "public"."SubjectType";

-- CreateTable
CREATE TABLE "CurriculumSubject" (
    "id" SERIAL NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "className" TEXT NOT NULL,
    "streamId" INTEGER,
    "subjectId" INTEGER NOT NULL,
    "category" "CurriculumCategory" NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumSubject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurriculumSubject_academicYearId_idx" ON "CurriculumSubject"("academicYearId");

-- CreateIndex
CREATE INDEX "CurriculumSubject_className_idx" ON "CurriculumSubject"("className");

-- CreateIndex
CREATE INDEX "CurriculumSubject_streamId_idx" ON "CurriculumSubject"("streamId");

-- CreateIndex
CREATE INDEX "CurriculumSubject_subjectId_idx" ON "CurriculumSubject"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumSubject_academicYearId_className_streamId_subject_key" ON "CurriculumSubject"("academicYearId", "className", "streamId", "subjectId");

-- AddForeignKey
ALTER TABLE "CurriculumSubject" ADD CONSTRAINT "CurriculumSubject_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumSubject" ADD CONSTRAINT "CurriculumSubject_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumSubject" ADD CONSTRAINT "CurriculumSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
