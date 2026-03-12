/*
  Warnings:

  - The values [LUNCH,ACTIVITY,OTHER] on the enum `SlotType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SlotType_new" AS ENUM ('CLASS', 'BREAK');
ALTER TABLE "TimetableSlot" ALTER COLUMN "slotType" TYPE "SlotType_new" USING ("slotType"::text::"SlotType_new");
ALTER TYPE "SlotType" RENAME TO "SlotType_old";
ALTER TYPE "SlotType_new" RENAME TO "SlotType";
DROP TYPE "public"."SlotType_old";
COMMIT;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_requestedClassroomId_fkey" FOREIGN KEY ("requestedClassroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequest" ADD CONSTRAINT "AdmissionRequest_requestedStreamId_fkey" FOREIGN KEY ("requestedStreamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
