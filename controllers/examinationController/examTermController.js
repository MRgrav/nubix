// controllers\examinationController\examTermController.js
import z from "zod";
import { sendError, sendSuccess } from "../../utils/responseStructure.js";
import prisma from "./../../models/prisma.js";

// In examTermController.js
const createExamTermSchema = z
  .object({
    academicYearId: z.number().int().positive("Academic Year ID required"),
    termName: z.string().min(1, "Term name required").max(100),
    // No configId allowed
  })
  .strict(); // ← .strict() rejects extra fields like configId

export const createExamTerm = async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") {
      return sendError(
        res,
        403,
        "Only Admin can create exam terms",
        "FORBIDDEN",
      );
    }

    console.log("createExamTerm called with body:", req.body); // ← debug log

    const data = createExamTermSchema.parse(req.body);

    const year = await prisma.academicYear.findUnique({
      where: { id: data.academicYearId },
    });
    if (!year) return sendError(res, 404, "Academic year not found");

    const duplicate = await prisma.examTerm.findFirst({
      where: {
        academicYearId: data.academicYearId,
        termName: data.termName.trim(),
        isDeleted: false,
      },
    });
    if (duplicate) {
      return sendError(
        res,
        409,
        "Term name already exists in this academic year",
        "DUPLICATE_TERM",
      );
    }

    const term = await prisma.examTerm.create({
      data: {
        academicYearId: data.academicYearId,
        termName: data.termName.trim(),
        createdById: req.user.id,
        updatedById: req.user.id,
      },
      include: {
        academicYear: { select: { label: true } },
      },
    });

    return sendSuccess(res, 201, term, "Exam term created successfully");
  } catch (err) {
    console.error("createExamTerm failed:", err);
    console.error("Full error stack:", err.stack || "No stack");

    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
        "VALIDATION_ERROR",
      );
    }

    return sendError(
      res,
      500,
      "Failed to create exam term",
      err.message || "Unknown error",
    );
  }
};

export const getExamTerms = async (req, res) => {
  const { academicYearId } = req.query;

  try {
    const where = academicYearId
      ? { academicYearId: Number(academicYearId) }
      : {};

    const terms = await prisma.examTerm.findMany({
      where,
      include: {
        academicYear: {
          select: {
            id: true,
            label: true,
            isActive: true,
          },
        },
        _count: { select: { exams: true } },
      },
      // FIX: Sort by termName directly, not through config
      orderBy: { termName: "asc" },
    });

    return sendSuccess(res, 200, terms, "Exam terms fetched");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch exam terms");
  }
};

// ────────────────────────────────────────────────
// Update Exam Term (Admin only - limited fields)
// ────────────────────────────────────────────────
export const updateExamTerm = async (req, res) => {
  const { id } = req.params;
  const { termName, isLocked, isPublished } = req.body;

  try {
    if (req.user.role !== "ADMIN") {
      return sendError(
        res,
        403,
        "Only Admin can update exam terms",
        "FORBIDDEN",
      );
    }

    const existing = await prisma.examTerm.findFirst({
      where: { id: Number(id), isDeleted: false },
    });

    if (!existing) {
      return sendError(res, 404, "Exam term not found or deleted", "NOT_FOUND");
    }

    // Prevent changing locked/published via this endpoint (use dedicated lock/publish)
    if (isLocked !== undefined || isPublished !== undefined) {
      return sendError(
        res,
        400,
        "Use /lock or /publish endpoints to change lock/publish status",
        "INVALID_OPERATION",
      );
    }

    const updatedTerm = await prisma.examTerm.update({
      where: { id: Number(id) },
      data: {
        termName: termName?.trim() || undefined,
        updatedById: req.user.id,
      },
      include: {
        academicYear: { select: { label: true } },
        config: { select: { termName: true } },
      },
    });

    return sendSuccess(res, 200, updatedTerm, "Exam term updated successfully");
  } catch (err) {
    console.error("Update exam term error:", err);
    return sendError(res, 500, "Failed to update exam term", "INTERNAL_ERROR");
  }
};

// ────────────────────────────────────────────────
// Soft Delete Exam Term (Admin only)
// ────────────────────────────────────────────────
export const deleteExamTerm = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.user.role !== "ADMIN") {
      return sendError(
        res,
        403,
        "Only Admin can delete exam terms",
        "FORBIDDEN",
      );
    }

    const term = await prisma.examTerm.findFirst({
      where: { id: Number(id), isDeleted: false },
      include: {
        _count: {
          select: {
            exams: true,
            results: true,
          },
        },
      },
    });

    if (!term) {
      return sendError(
        res,
        404,
        "Exam term not found or already deleted",
        "NOT_FOUND",
      );
    }

    if (term._count.exams > 0 || term._count.results > 0) {
      return sendError(
        res,
        409,
        "Cannot delete term - it has associated exams or results",
        "DEPENDENCY_CONFLICT",
      );
    }

    await prisma.examTerm.update({
      where: { id: Number(id) },
      data: {
        isDeleted: true,
        updatedById: req.user.id,
      },
    });

    return sendSuccess(res, 200, null, "Exam term soft-deleted successfully");
  } catch (err) {
    console.error("Delete exam term error:", err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Exam term not found", "NOT_FOUND");
    }
    return sendError(res, 500, "Failed to delete exam term", "INTERNAL_ERROR");
  }
};

// Lock term (prevent further marks editing)
export const lockTermResults = async (req, res) => {
  const { termId } = req.body;

  if (!termId) return sendError(res, 400, "termId is required");

  try {
    const term = await prisma.examTerm.update({
      where: { id: Number(termId) },
      data: {
        isLocked: true,
        lockedAt: new Date(),
      },
    });

    return sendSuccess(
      res,
      200,
      term,
      "Term results locked successfully. No more marks can be edited.",
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to lock term results");
  }
};

// Publish term results (make visible to students/parents)
export const publishTermResults = async (req, res) => {
  const { termId } = req.body;

  if (!termId) return sendError(res, 400, "termId is required");

  try {
    const term = await prisma.examTerm.update({
      where: { id: Number(termId) },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    // Future: Add email/SMS notification here

    return sendSuccess(
      res,
      200,
      term,
      "Results published successfully. Students and parents can now view them.",
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to publish results");
  }
};
