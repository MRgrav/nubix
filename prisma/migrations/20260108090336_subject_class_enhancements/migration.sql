-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('FIXED', 'ELECTIVE', 'EXTRACURRICULAR', 'COMMON', 'STREAM_SPECIFIC');

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "applicableClasses" TEXT[],
ADD COLUMN     "type" "SubjectType";

-- CreateTable
CREATE TABLE "SubjectClassRelation" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "classroomId" INTEGER NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "streamId" INTEGER,

    CONSTRAINT "SubjectClassRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectClassRelation_subjectId_idx" ON "SubjectClassRelation"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectClassRelation_classroomId_idx" ON "SubjectClassRelation"("classroomId");

-- CreateIndex
CREATE INDEX "SubjectClassRelation_streamId_idx" ON "SubjectClassRelation"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectClassRelation_subjectId_classroomId_streamId_key" ON "SubjectClassRelation"("subjectId", "classroomId", "streamId");

-- AddForeignKey
ALTER TABLE "SubjectClassRelation" ADD CONSTRAINT "SubjectClassRelation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectClassRelation" ADD CONSTRAINT "SubjectClassRelation_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectClassRelation" ADD CONSTRAINT "SubjectClassRelation_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
