/*
  Warnings:

  - A unique constraint covering the columns `[staffId,isPrimary]` on the table `StaffEmergencyContact` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "StaffEmergencyContact_staffId_isPrimary_key" ON "StaffEmergencyContact"("staffId", "isPrimary");
