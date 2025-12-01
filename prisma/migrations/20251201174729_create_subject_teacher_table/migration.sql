/*
  Warnings:

  - You are about to drop the column `teacherId` on the `Subject` table. All the data in the column will be lost.
  - You are about to drop the column `teacherName` on the `Subject` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Subject" DROP CONSTRAINT "Subject_teacherId_fkey";

-- DropIndex
DROP INDEX "public"."Subject_teacherId_idx";

-- AlterTable
ALTER TABLE "Subject" DROP COLUMN "teacherId",
DROP COLUMN "teacherName";

-- CreateTable
CREATE TABLE "_StaffToSubject" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_StaffToSubject_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_StaffToSubject_B_index" ON "_StaffToSubject"("B");

-- AddForeignKey
ALTER TABLE "_StaffToSubject" ADD CONSTRAINT "_StaffToSubject_A_fkey" FOREIGN KEY ("A") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StaffToSubject" ADD CONSTRAINT "_StaffToSubject_B_fkey" FOREIGN KEY ("B") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
