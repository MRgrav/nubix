-- DropIndex
DROP INDEX IF EXISTS "Homework_targetClass_idx";

-- AlterTable
ALTER TABLE "Homework" DROP COLUMN IF EXISTS "targetClass";

-- AlterTable
ALTER TABLE "Homework" ADD COLUMN "classId" INTEGER;

-- CreateIndex
CREATE INDEX "Homework_classId_idx" ON "Homework"("classId");

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
