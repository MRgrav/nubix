-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FeeCategoryType" ADD VALUE 'ADMISSION';
ALTER TYPE "FeeCategoryType" ADD VALUE 'REGISTRATION';
ALTER TYPE "FeeCategoryType" ADD VALUE 'CAUTION_MONEY';
ALTER TYPE "FeeCategoryType" ADD VALUE 'ID_CARD';
ALTER TYPE "FeeCategoryType" ADD VALUE 'ANNUAL_CHARGES';
ALTER TYPE "FeeCategoryType" ADD VALUE 'COMPUTER';
ALTER TYPE "FeeCategoryType" ADD VALUE 'LABORATORY';
ALTER TYPE "FeeCategoryType" ADD VALUE 'ARTS';
ALTER TYPE "FeeCategoryType" ADD VALUE 'HOSTEL';
ALTER TYPE "FeeCategoryType" ADD VALUE 'MESS';
ALTER TYPE "FeeCategoryType" ADD VALUE 'BOOKS';
ALTER TYPE "FeeCategoryType" ADD VALUE 'UNIFORM';
ALTER TYPE "FeeCategoryType" ADD VALUE 'INSURANCE';
