// controllers\examinationController\examResultController.js
import { sendError, sendSuccess } from "../../utils/responseStructure.js";
import prisma from "./../../models/prisma.js";

export const getExamResults = async (req, res) => {
  const { termId, studentId, isPublished = "true" } = req.query;

  try {
    const where = {};

    if (termId) where.termId = Number(termId);
    if (studentId) where.studentId = Number(studentId);

    // Only show published results unless admin/staff
    if (isPublished === "true" && !["ADMIN", "STAFF"].includes(req.user.role)) {
      where.term = { isPublished: true };
    }

    // Role-based restrictions
    if (req.user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: req.user.id },
        select: { id: true },
      });
      if (!student) return sendError(res, 403, "No student profile found");
      where.studentId = student.id;
    } else if (req.user.role === "PARENT") {
      const actingStudentId = req.user.actingAsStudentId;
      if (!actingStudentId) return sendError(res, 403, "No child selected");
      where.studentId = actingStudentId;
    }

    const results = await prisma.examResult.findMany({
      where,
      include: {
        student: { select: { id: true, name: true } },
        term: {
          include: {
            academicYear: { select: { label: true } },
          },
        },
        calculatedBy: { select: { id: true, email: true, role: true } },
        updatedBy: { select: { id: true, email: true, role: true } },
      },
      orderBy: [{ percentage: "desc" }, { student: { name: "asc" } }],
    });

    return sendSuccess(res, 200, results, "Exam results fetched successfully", {
      total: results.length,
      publishedOnly: isPublished === "true",
    });
  } catch (err) {
    console.error("Get exam results error:", err);
    return sendError(res, 500, "Failed to fetch exam results", err.message);
  }
};

/**
 * Calculate and save term results for all students
 * Only callable by ADMIN/STAFF when term is not locked
 */
export const calculateTermResults = async (req, res) => {
  const { termId } = req.body;

  if (!termId) return sendError(res, 400, "termId is required");

  const termIdNum = Number(termId);

  try {
    console.log(`[CALC] Starting calculation for termId: ${termIdNum}`);

    if (!["ADMIN", "STAFF"].includes(req.user.role)) {
      return sendError(res, 403, "Only Admin or Staff can calculate results");
    }

    const term = await prisma.examTerm.findUnique({
      where: { id: termIdNum },
      include: {
        academicYear: true,
        exams: {
          select: {
            id: true,
            config: {
              select: {
                weightage: true,
                carryForward: true,
              },
            },
            marks: {
              select: {
                studentId: true,
                marksObtained: true,
                theoryMarks: true,
                practicalMarks: true,
                internalMarks: true,
              },
            },
          },
        },
      },
    });

    if (!term) return sendError(res, 404, "Term not found");

    if (term.isLocked) {
      return sendError(res, 403, "Term is locked", "TERM_LOCKED");
    }

    // Fallback grading schemes
    const gradingSchemes = [];
    try {
      const board = await prisma.board.findFirst({
        where: {
          examConfigs: {
            some: {
              exams: { some: { termId: termIdNum } },
            },
          },
        },
        select: {
          gradingSchemes: {
            select: { grade: true, minPercent: true, maxPercent: true },
            orderBy: { minPercent: "desc" },
          },
        },
      });
      if (board?.gradingSchemes) {
        gradingSchemes.push(...board.gradingSchemes);
      }
    } catch (e) {
      console.warn("[CALC] Could not load grading schemes:", e.message);
    }

    // Students with marks
    const studentIdsRaw = await prisma.$queryRaw`
      SELECT DISTINCT s.id
      FROM "Student" s
      JOIN "ExamMarks" em ON em."studentId" = s.id
      JOIN "Exam" e ON e.id = em."examId"
      WHERE e."termId" = ${termIdNum}
    `;

    const studentIds = studentIdsRaw.map((row) => Number(row.id));

    if (studentIds.length === 0) {
      return sendSuccess(res, 200, { message: "No marks entered yet" });
    }

    const results = await prisma.$transaction(async (tx) => {
      const processed = [];

      for (const studentId of studentIds) {
        console.log(`[CALC] Processing student ${studentId}`);

        const studentMarks = await tx.examMarks.findMany({
          where: { exam: { termId: termIdNum }, studentId },
          include: {
            exam: {
              select: {
                config: { select: { weightage: true } },
                maxMarks: true,
              },
            },
          },
        });

        if (studentMarks.length === 0) continue;

        let totalWeighted = 0;
        let totalWeight = 0;
        let hasMissing = false;

        for (const mark of studentMarks) {
          const weight = mark.exam.config?.weightage ?? 0;

          let obtained = mark.marksObtained || 0;
          if (mark.theoryMarks || mark.practicalMarks || mark.internalMarks) {
            obtained =
              (mark.theoryMarks || 0) +
              (mark.practicalMarks || 0) +
              (mark.internalMarks || 0);
          }

          if (obtained === 0 && mark.exam.maxMarks > 0) hasMissing = true;

          totalWeighted += obtained * (weight / 100);
          totalWeight += weight;
        }

        const percentage =
          totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : 0;
        const roundedPercentage = Math.round(percentage * 100) / 100;

        let grade = "F";
        for (const gs of gradingSchemes) {
          if (percentage >= gs.minPercent && percentage <= gs.maxPercent) {
            grade = gs.grade;
            break;
          }
        }

        // Carry-forward (simple version)
        let finalPercentage = roundedPercentage;
        let carryRemarks = "";

        // Upsert
        const result = await tx.examResult.upsert({
          where: { studentId_termId: { studentId, termId: termIdNum } },
          update: {
            totalMarks: Math.round(totalWeighted),
            percentage: finalPercentage,
            grade,
            remarks:
              carryRemarks +
              (grade === "F" ? " Needs improvement" : " Good performance"),
            isComplete: !hasMissing,
            calculationRemarks: hasMissing
              ? "Missing marks in some exams"
              : null,
            updatedById: req.user.id,
            calculationVersion: { increment: 1 },
          },
          create: {
            studentId,
            termId: termIdNum,
            totalMarks: Math.round(totalWeighted),
            percentage: finalPercentage,
            grade,
            remarks:
              carryRemarks +
              (grade === "F" ? " Needs improvement" : " Good performance"),
            isComplete: !hasMissing,
            calculationRemarks: hasMissing
              ? "Missing marks in some exams"
              : null,
            calculatedById: req.user.id,
            updatedById: req.user.id,
          },
        });

        processed.push({
          studentId,
          percentage: finalPercentage,
          grade,
          isComplete: result.isComplete,
        });
      }

      return processed;
    });

    return sendSuccess(res, 200, {
      termId: termIdNum,
      totalStudentsProcessed: results.length,
      results,
      message: "Term results calculated successfully",
    });
  } catch (err) {
    console.error("CALCULATION FAILED FOR TERM", termIdNum);
    console.error("Error:", err);
    console.error("Stack:", err.stack);
    return sendError(
      res,
      500,
      "Failed to calculate results",
      err.message || "Unknown error",
    );
  }
};
