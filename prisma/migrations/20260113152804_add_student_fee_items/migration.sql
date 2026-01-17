/*
  Warnings:

  - You are about to drop the column `feeStructureId` on the `StudentFee` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."StudentFee" DROP CONSTRAINT "StudentFee_feeStructureId_fkey";

-- AlterTable
ALTER TABLE "StudentFee" DROP COLUMN "feeStructureId";

-- CreateTable
CREATE TABLE "StudentFeeItem" (
    "id" SERIAL NOT NULL,
    "studentFeeId" INTEGER NOT NULL,
    "feeStructureId" INTEGER NOT NULL,
    "assignedAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentFeeItem_studentFeeId_idx" ON "StudentFeeItem"("studentFeeId");

-- CreateIndex
CREATE INDEX "StudentFeeItem_feeStructureId_idx" ON "StudentFeeItem"("feeStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFeeItem_studentFeeId_feeStructureId_key" ON "StudentFeeItem"("studentFeeId", "feeStructureId");

-- AddForeignKey
ALTER TABLE "StudentFeeItem" ADD CONSTRAINT "StudentFeeItem_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeItem" ADD CONSTRAINT "StudentFeeItem_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
