-- AlterTable
ALTER TABLE "Exam" ALTER COLUMN "maxMarks" DROP NOT NULL,
ALTER COLUMN "passMarks" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ExamConfig" ADD COLUMN     "internalMaxMarks" INTEGER,
ADD COLUMN     "internalPassMarks" INTEGER,
ADD COLUMN     "practicalMaxMarks" INTEGER,
ADD COLUMN     "practicalPassMarks" INTEGER,
ADD COLUMN     "theoryMaxMarks" INTEGER,
ADD COLUMN     "theoryPassMarks" INTEGER;
