// controllers\examinationController\examMarksController.js
import { Prisma } from "@prisma/client";
import { sendError, sendSuccess } from "../../utils/responseStructure.js";
import prisma from "./../../models/prisma.js"; // ← this is the instance
import z from "zod";

// Zod schema for bulk marks entry
const markEntrySchema = z.object({
  studentId: z.number().int().positive("Invalid student ID"),
  theoryMarks: z.number().int().nonnegative().optional(),
  practicalMarks: z.number().int().nonnegative().optional(),
  internalMarks: z.number().int().nonnegative().optional(),
  marksObtained: z.number().int().nonnegative().optional(), // fallback/total
  remarks: z.string().optional().nullable(),
});

const bulkMarksSchema = z.object({
  marks: z.array(markEntrySchema).min(1, "At least one mark entry required"),
});

export const enterExamMarks = async (req, res) => {
  const examId = Number(req.params.examId);
  const { marks } = req.body;

  try {
    // Validate input structure
    const validated = bulkMarksSchema.parse({ marks });

    // Fetch exam + config + classroom + subject
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        term: { include: { academicYear: true } },
        classroom: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        config: true,
      },
    });

    if (!exam) return sendError(res, 404, "Exam not found", "NOT_FOUND");

    // Teacher assignment check
    if (req.user.role === "STAFF") {
      const assignment = await prisma.teacherAssignment.findFirst({
        where: {
          teacherId: req.user.staff?.id,
          subjectId: exam.subjectId,
          classroomId: exam.classroomId,
          academicYearId: exam.term.academicYearId,
          status: "ACTIVE",
        },
      });

      if (!assignment) {
        return sendError(
          res,
          403,
          "You are not assigned to teach this subject in this class",
          "TEACHER_NOT_ASSIGNED",
        );
      }
    }

    const config = exam.config;

    if (!config) {
      return sendError(
        res,
        404,
        "No exam config found for this exam",
        "CONFIG_MISSING",
      );
    }

    // ─── Batch validate all students have this subject (core or elective) ───
    const studentIds = validated.marks.map((m) => m.studentId);

    // Fixed: use prisma.join instead of Prisma.join
    const enrolledStudents = await prisma.$queryRaw`
      SELECT DISTINCT s.id
      FROM "Student" s
      WHERE s.id IN (${Prisma.join(studentIds)})
        AND (
          -- Core/common subjects
          EXISTS (
            SELECT 1 FROM "CurriculumSubject" cs
            WHERE cs."subjectId" = ${exam.subjectId}
              AND cs."className" = ${exam.classroom.name.replace(/\D/g, "").trim()}
              AND cs."academicYearId" = ${exam.term.academicYearId}
              AND cs."streamId" IS NULL
          )
          OR
          -- Stream-specific subjects
          EXISTS (
            SELECT 1 FROM "CurriculumSubject" cs
            JOIN "StudentStream" ss ON ss."streamId" = cs."streamId"
            WHERE cs."subjectId" = ${exam.subjectId}
              AND cs."className" = ${exam.classroom.name.replace(/\D/g, "").trim()}
              AND cs."academicYearId" = ${exam.term.academicYearId}
              AND ss."studentId" = s.id
              AND ss."academicYearId" = ${exam.term.academicYearId}
          )
          OR
          -- Elective subjects chosen & approved
          EXISTS (
            SELECT 1 FROM "StudentElectiveChoice" sec
            WHERE sec."studentId" = s.id
              AND sec."curriculumSubjectId" IN (
                SELECT id FROM "CurriculumSubject"
                WHERE "subjectId" = ${exam.subjectId}
                  AND "academicYearId" = ${exam.term.academicYearId}
              )
              AND sec.status = 'APPROVED'
          )
        )
    `;

    const validStudentIds = new Set(enrolledStudents.map((s) => Number(s.id)));

    // ─── Process each mark entry ───
    const results = await prisma.$transaction(async (tx) => {
      const processed = [];

      for (const m of validated.marks) {
        const studentId = m.studentId;

        // 1. Student must be enrolled in the subject
        if (!validStudentIds.has(studentId)) {
          processed.push({
            studentId,
            status: "FAILED",
            error: "Student is not enrolled in this subject (core/elective)",
          });
          continue;
        }

        let totalObtained = 0;
        let passStatus = "PASS";

        // 2. Theory validation
        if (config.theoryMaxMarks) {
          const theory = Number(m.theoryMarks ?? 0);
          if (isNaN(theory) || theory < 0 || theory > config.theoryMaxMarks) {
            processed.push({
              studentId,
              status: "FAILED",
              error: `Theory marks must be 0–${config.theoryMaxMarks}`,
            });
            continue;
          }
          totalObtained += theory;
          if (config.theoryPassMarks && theory < config.theoryPassMarks) {
            passStatus = "FAIL (Theory)";
          }
        }

        // 3. Practical validation
        if (config.practicalMaxMarks) {
          const practical = Number(m.practicalMarks ?? 0);
          if (
            isNaN(practical) ||
            practical < 0 ||
            practical > config.practicalMaxMarks
          ) {
            processed.push({
              studentId,
              status: "FAILED",
              error: `Practical marks must be 0–${config.practicalMaxMarks}`,
            });
            continue;
          }
          totalObtained += practical;
          if (
            config.practicalPassMarks &&
            practical < config.practicalPassMarks
          ) {
            passStatus = "FAIL (Practical)";
          }
        }

        // 4. Internal validation
        if (config.internalMaxMarks) {
          const internal = Number(m.internalMarks ?? 0);
          if (
            isNaN(internal) ||
            internal < 0 ||
            internal > config.internalMaxMarks
          ) {
            processed.push({
              studentId,
              status: "FAILED",
              error: `Internal marks must be 0–${config.internalMaxMarks}`,
            });
            continue;
          }
          totalObtained += internal;
          if (config.internalPassMarks && internal < config.internalPassMarks) {
            passStatus = "FAIL (Internal)";
          }
        }

        // 5. Fallback to total if no split config
        if (
          !config.theoryMaxMarks &&
          !config.practicalMaxMarks &&
          !config.internalMaxMarks
        ) {
          const obtained = Number(m.marksObtained ?? totalObtained);
          if (
            isNaN(obtained) ||
            obtained < 0 ||
            obtained > (exam.maxMarks || 100)
          ) {
            processed.push({
              studentId,
              status: "FAILED",
              error: `Marks must be 0–${exam.maxMarks || 100}`,
            });
            continue;
          }
          totalObtained = obtained;
        }

        // 6. Upsert marks record
        const record = await tx.examMarks.upsert({
          where: { examId_studentId: { examId, studentId } },
          update: {
            marksObtained: totalObtained,
            theoryMarks: m.theoryMarks ?? null,
            practicalMarks: m.practicalMarks ?? null,
            internalMarks: m.internalMarks ?? null,
            theoryPass: config.theoryPassMarks
              ? m.theoryMarks >= config.theoryPassMarks
              : null,
            practicalPass: config.practicalPassMarks
              ? m.practicalMarks >= config.practicalPassMarks
              : null,
            internalPass: config.internalPassMarks
              ? m.internalMarks >= config.internalPassMarks
              : null,
            overallPass: passStatus === "PASS",
            remarks: `${m.remarks || ""} - ${passStatus}`.trim(),
            updatedById: req.user.id,
          },
          create: {
            examId,
            studentId,
            marksObtained: totalObtained,
            theoryMarks: m.theoryMarks ?? null,
            practicalMarks: m.practicalMarks ?? null,
            internalMarks: m.internalMarks ?? null,
            theoryPass: config.theoryPassMarks
              ? m.theoryMarks >= config.theoryPassMarks
              : null,
            practicalPass: config.practicalPassMarks
              ? m.practicalMarks >= config.practicalPassMarks
              : null,
            internalPass: config.internalPassMarks
              ? m.internalMarks >= config.internalPassMarks
              : null,
            overallPass: passStatus === "PASS",
            remarks: `${m.remarks || ""} - ${passStatus}`.trim(),
            enteredById: req.user.id,
            updatedById: req.user.id,
          },
        });

        processed.push({
          studentId,
          status: "SUCCESS",
          recordId: record.id,
        });
      }

      return processed;
    });

    const successCount = results.filter((r) => r.status === "SUCCESS").length;
    const failed = results.filter((r) => r.status === "FAILED");

    return sendSuccess(res, 201, {
      message: `Marks processed: ${successCount} successful, ${failed.length} failed`,
      results,
      failed,
    });
  } catch (err) {
    console.error("Enter marks error:", err);
    return sendError(res, 500, "Failed to enter marks", err.message);
  }
};

export const getExamMarks = async (req, res) => {
  const examId = Number(req.params.examId);
  const { studentId, includeRemarks = "true" } = req.query;

  try {
    const where = { examId };
    if (studentId) where.studentId = Number(studentId);

    // Role-based restrictions
    if (req.user.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: req.user.userId },
        select: { id: true },
      });
      if (!student) return sendError(res, 403, "No student profile found");
      where.studentId = student.id;
    } else if (req.user.role === "PARENT") {
      const actingStudentId = req.user.actingAsStudentId;
      if (!actingStudentId) return sendError(res, 403, "No child selected");
      where.studentId = actingStudentId;
    }

    const marks = await prisma.examMarks.findMany({
      where,
      include: {
        student: { select: { id: true, name: true } },
        enteredBy: { select: { id: true, email: true, role: true } },
        updatedBy: { select: { id: true, email: true, role: true } },
      },
      orderBy: { student: { name: "asc" } },
    });

    return sendSuccess(res, 200, marks, "Exam marks fetched successfully");
  } catch (err) {
    console.error("Get marks error:", err);
    return sendError(res, 500, "Failed to fetch marks", err.message);
  }
};
