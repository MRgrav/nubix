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
  marksObtained: z.number().int().nonnegative().optional(),
  remarks: z.string().optional().nullable(),
});

const bulkMarksSchema = z.object({
  marks: z.array(markEntrySchema).min(1, "At least one mark entry required"),
});

export const enterExamMarks = async (req, res) => {
  const examId = Number(req.params.examId);
  const { marks } = req.body;

  try {
    const validated = bulkMarksSchema.parse({ marks });

    // Fetch exam details
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

    // === VALIDATION: Only allow marks after exam is COMPLETED ===
    if (exam.status !== "COMPLETED") {
      return sendError(
        res,
        400,
        `Cannot enter marks. Current status is ${exam.status}. Marks can only be entered when status is COMPLETED.`,
        "INVALID_EXAM_STATUS",
      );
    }

    // Teacher authorization check
    if (req.user.role === "STAFF") {
      const assignment = await prisma.teacherAssignment.findFirst({
        where: {
          teacherId: req.user.staffId || req.user.staff?.id, // safer fallback
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

    const studentIds = validated.marks.map((m) => m.studentId);

    // === IMPROVED: Simplified & Correct Enrollment Check using classroomId ===
    const enrolledStudents = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        OR: [
          // Students enrolled in this classroom + subject via CurriculumSubject
          {
            classroomId: exam.classroomId,
            studentStreams: {
              some: {
                academicYearId: exam.term.academicYearId,
                OR: [
                  { streamId: null },
                  { streamId: exam.streamId || undefined },
                ],
              },
            },
          },
          // Elective subject approved
          {
            studentElectiveChoices: {
              some: {
                curriculumSubject: {
                  subjectId: exam.subjectId,
                  academicYearId: exam.term.academicYearId,
                },
                status: "APPROVED",
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    const validStudentIds = new Set(enrolledStudents.map((s) => s.id));

    // Process marks in transaction
    const results = await prisma.$transaction(async (tx) => {
      const processed = [];

      for (const m of validated.marks) {
        const studentId = m.studentId;

        if (!validStudentIds.has(studentId)) {
          processed.push({
            studentId,
            status: "FAILED",
            error: "Student not enrolled in this subject",
          });
          continue;
        }

        let totalObtained = 0;
        let passStatus = "PASS";

        // Theory
        if (config.theoryMaxMarks != null) {
          const theory = Number(m.theoryMarks ?? 0);
          if (theory > config.theoryMaxMarks) {
            processed.push({
              studentId,
              status: "FAILED",
              error: `Theory marks exceed max (${config.theoryMaxMarks})`,
            });
            continue;
          }
          totalObtained += theory;
          if (config.theoryPassMarks && theory < config.theoryPassMarks)
            passStatus = "FAIL (Theory)";
        }

        // Practical
        if (config.practicalMaxMarks != null) {
          const practical = Number(m.practicalMarks ?? 0);
          if (practical > config.practicalMaxMarks) {
            processed.push({
              studentId,
              status: "FAILED",
              error: `Practical marks exceed max (${config.practicalMaxMarks})`,
            });
            continue;
          }
          totalObtained += practical;
          if (
            config.practicalPassMarks &&
            practical < config.practicalPassMarks
          )
            passStatus = "FAIL (Practical)";
        }

        // Internal
        if (config.internalMaxMarks != null) {
          const internal = Number(m.internalMarks ?? 0);
          if (internal > config.internalMaxMarks) {
            processed.push({
              studentId,
              status: "FAILED",
              error: `Internal marks exceed max (${config.internalMaxMarks})`,
            });
            continue;
          }
          totalObtained += internal;
          if (config.internalPassMarks && internal < config.internalPassMarks)
            passStatus = "FAIL (Internal)";
        }

        // Fallback total marks
        if (
          !config.theoryMaxMarks &&
          !config.practicalMaxMarks &&
          !config.internalMaxMarks
        ) {
          const obtained = Number(m.marksObtained ?? totalObtained);
          if (obtained > (exam.maxMarks || 100)) {
            processed.push({
              studentId,
              status: "FAILED",
              error: `Marks exceed max (${exam.maxMarks || 100})`,
            });
            continue;
          }
          totalObtained = obtained;
        }

        // Upsert
        const record = await tx.examMarks.upsert({
          where: { examId_studentId: { examId, studentId } },
          update: {
            marksObtained: totalObtained,
            theoryMarks: m.theoryMarks ?? null,
            practicalMarks: m.practicalMarks ?? null,
            internalMarks: m.internalMarks ?? null,
            theoryPass: config.theoryPassMarks
              ? (m.theoryMarks ?? 0) >= config.theoryPassMarks
              : null,
            practicalPass: config.practicalPassMarks
              ? (m.practicalMarks ?? 0) >= config.practicalPassMarks
              : null,
            internalPass: config.internalPassMarks
              ? (m.internalMarks ?? 0) >= config.internalPassMarks
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
              ? (m.theoryMarks ?? 0) >= config.theoryPassMarks
              : null,
            practicalPass: config.practicalPassMarks
              ? (m.practicalMarks ?? 0) >= config.practicalPassMarks
              : null,
            internalPass: config.internalPassMarks
              ? (m.internalMarks ?? 0) >= config.internalPassMarks
              : null,
            overallPass: passStatus === "PASS",
            remarks: `${m.remarks || ""} - ${passStatus}`.trim(),
            enteredById: req.user.id,
            updatedById: req.user.id,
          },
        });

        processed.push({ studentId, status: "SUCCESS", recordId: record.id });
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
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
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
