-- AlterTable
ALTER TABLE "Subject"
ADD COLUMN "teacherId" INTEGER,
ADD COLUMN "teacherName" TEXT;

-- CreateIndex
CREATE INDEX "Subject_teacherId_idx" ON "Subject"("teacherId");

-- AddForeignKey
ALTER TABLE "Subject"
ADD CONSTRAINT "Subject_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;


