/*
  Warnings:

  - You are about to drop the column `address` on the `School` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[schoolId]` on the table `Address` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "schoolId" INTEGER;

-- AlterTable
ALTER TABLE "School" DROP COLUMN "address";

-- CreateIndex
CREATE UNIQUE INDEX "Address_schoolId_key" ON "Address"("schoolId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
