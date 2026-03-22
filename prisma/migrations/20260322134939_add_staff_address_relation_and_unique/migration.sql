/*
  Warnings:

  - You are about to drop the `_StaffAddresses` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[staffId,addressType]` on the table `Address` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."_StaffAddresses" DROP CONSTRAINT "_StaffAddresses_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_StaffAddresses" DROP CONSTRAINT "_StaffAddresses_B_fkey";

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "staffId" INTEGER;

-- DropTable
DROP TABLE "public"."_StaffAddresses";

-- CreateIndex
CREATE UNIQUE INDEX "Address_staffId_addressType_key" ON "Address"("staffId", "addressType");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
