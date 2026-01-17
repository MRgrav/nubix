-- DropForeignKey
ALTER TABLE "public"."TeacherAssignment" DROP CONSTRAINT "TeacherAssignment_classroomId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TeacherAssignment" DROP CONSTRAINT "TeacherAssignment_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TeacherAssignment" DROP CONSTRAINT "TeacherAssignment_teacherId_fkey";

-- DropIndex
DROP INDEX "public"."teacher_assignment_base_idx";

-- AlterTable
ALTER TABLE "TeacherAssignment" ALTER COLUMN "classroomId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
