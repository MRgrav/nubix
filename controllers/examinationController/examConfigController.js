// controllers\examinationController\examConfigController.js

import { Prisma, PrismaClient } from "@prisma/client";
import { sendError, sendSuccess } from "../../utils/responseStructure.js";
import prisma from "./../../models/prisma.js";
import z from "zod";

// ────────────────────────────────────────────────
// Validation Schemas
// ────────────────────────────────────────────────
const createExamConfigSchema = z.object({
  boardId: z.number().int().positive("Board ID required"),
  academicYearId: z.number().int().positive("Academic Year ID required"),
  name: z.string().min(1, "Name required").max(100),
  weightage: z.number().min(0).max(100, "Weightage cannot exceed 100"),
  carryForward: z.boolean().optional().default(false),
  maxMarks: z.number().int().positive("Max marks required"),
  passMarks: z.number().int().nonnegative("Pass marks required"),
  gradingSchemeId: z.number().int().positive().nullable().optional(),
  subjectId: z.number().int().positive().nullable().optional(),
  theoryMaxMarks: z.number().int().nonnegative().optional(),
  practicalMaxMarks: z.number().int().nonnegative().optional(),
  internalMaxMarks: z.number().int().nonnegative().optional(),
  theoryPassMarks: z.number().int().nonnegative().optional(),
  practicalPassMarks: z.number().int().nonnegative().optional(),
  internalPassMarks: z.number().int().nonnegative().optional(),
});

const updateExamConfigSchema = createExamConfigSchema.partial();

const createGradingSchemeSchema = z.object({
  boardId: z.number().int().positive("Board ID required"),
  academicYearId: z.number().int().positive("Academic Year ID required"),
  grade: z.string().min(1).max(10),
  minPercent: z.number().min(0).max(100),
  maxPercent: z.number().min(0).max(100),
  formula: z.string().optional(),
});

// ────────────────────────────────────────────────
// Helper: Filter out read-only fields from update payload
// ────────────────────────────────────────────────
const readOnlyFields = [
  "id",
  "createdAt",
  "updatedAt",
  "createdById",
  "updatedById",
  "isDeleted",
];

function filterUpdateData(updates) {
  const filtered = { ...updates };
  readOnlyFields.forEach((field) => delete filtered[field]);
  return filtered;
}

// ────────────────────────────────────────────────
// Exam Config CRUD
// ────────────────────────────────────────────────

// 1. Create Exam Config (Admin only)
export const createExamConfig = async (req, res) => {
  try {
    const data = createExamConfigSchema.parse(req.body);

    // Validate board exists
    const board = await prisma.board.findUnique({
      where: { id: data.boardId },
    });
    if (!board) return sendError(res, 404, "Board not found", "NOT_FOUND");

    // Validate academic year exists and is active
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: data.academicYearId },
    });
    if (!academicYear)
      return sendError(res, 404, "Academic year not found", "NOT_FOUND");
    if (!academicYear.isActive) {
      return sendError(
        res,
        400,
        "Cannot create config in inactive academic year",
        "INACTIVE_YEAR",
      );
    }

    // Prevent duplicate config per board/year/subject/term
    const duplicate = await prisma.examConfig.findFirst({
      where: {
        boardId: data.boardId,
        academicYearId: data.academicYearId,
        subjectId: data.subjectId || null,
        name: data.name.trim(),
      },
    });
    if (duplicate) {
      return sendError(
        res,
        409,
        "Exam config already exists for this board/year/subject/term",
        "DUPLICATE_CONFIG",
      );
    }

    // Validate total weightage ≤ 100 for subject/year (if subject-specific)
    if (data.subjectId) {
      const existingWeightage = await prisma.examConfig.aggregate({
        where: {
          boardId: data.boardId,
          academicYearId: data.academicYearId,
          subjectId: data.subjectId,
        },
        _sum: { weightage: true },
      });
      const currentTotal =
        (existingWeightage._sum.weightage || 0) + data.weightage;
      if (currentTotal > 100) {
        return sendError(
          res,
          400,
          `Total weightage for this subject would exceed 100% (${currentTotal}%)`,
          "WEIGHTAGE_OVERFLOW",
        );
      }
    }

    const config = await prisma.examConfig.create({
      data: {
        ...data,
        name: data.name.trim(),
        createdById: req.user.id,
        updatedById: req.user.id,
      },
      include: {
        board: { select: { name: true } },
        academicYear: { select: { label: true } },
        subject: true,
        gradingScheme: true,
      },
    });

    return sendSuccess(
      res,
      201,
      config,
      "Exam configuration created successfully",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return sendError(res, 400, messages, "VALIDATION_ERROR");
    }

    console.error("Full error in createExamConfig:", err);

    if (err.code === "P2003") {
      return sendError(
        res,
        400,
        "Invalid reference (boardId or academicYearId not found)",
        "INVALID_REFERENCE",
      );
    }
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Duplicate config (unique constraint violation)",
        "DUPLICATE_CONFIG",
      );
    }

    return sendError(
      res,
      500,
      "Failed to create exam config",
      err.message || "Unknown server error",
    );
  }
};

// 2. Get Exam Configs (filter by board/year/subject)
export const getExamConfigs = async (req, res) => {
  const { boardId, academicYearId, subjectId } = req.query;

  try {
    const where = {
      boardId: boardId ? Number(boardId) : undefined,
      academicYearId: academicYearId ? Number(academicYearId) : undefined,
      subjectId: subjectId ? Number(subjectId) : undefined,
      isDeleted: false,
    };

    const configs = await prisma.examConfig.findMany({
      where,
      include: {
        board: { select: { id: true, name: true } },
        academicYear: { select: { label: true } },
        subject: { select: { id: true, name: true, code: true } },
        gradingScheme: true,
      },
      orderBy: [{ academicYear: { startDate: "desc" } }, { name: "asc" }],
    });

    return sendSuccess(
      res,
      200,
      configs,
      "Exam configurations fetched successfully",
      {
        total: configs.length,
      },
    );
  } catch (err) {
    console.error("Get exam configs error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch exam configs",
      err.message || "Internal error",
    );
  }
};

// 3. Update Exam Config (Admin only)
export const updateExamConfig = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    if (req.user.role !== "ADMIN") {
      return sendError(
        res,
        403,
        "Only Admin can update exam configs",
        "FORBIDDEN",
      );
    }

    // Filter out read-only fields
    const filteredUpdates = filterUpdateData(updates);

    const data = updateExamConfigSchema.parse(filteredUpdates);

    const existing = await prisma.examConfig.findFirst({
      where: { id: Number(id), isDeleted: false },
      include: { academicYear: true },
    });

    if (!existing) {
      return sendError(
        res,
        404,
        "Exam config not found or deleted",
        "NOT_FOUND",
      );
    }

    // Validate new academicYearId if changed
    if (
      data.academicYearId !== undefined &&
      data.academicYearId !== existing.academicYearId
    ) {
      const newYear = await prisma.academicYear.findUnique({
        where: { id: data.academicYearId },
      });
      if (!newYear) return sendError(res, 404, "New academic year not found");
      if (!newYear.isActive) {
        return sendError(
          res,
          400,
          "Cannot move config to inactive academic year",
        );
      }
    }

    // Re-check duplicate if key fields changed
    const newBoardId = data.boardId ?? existing.boardId;
    const newYearId = data.academicYearId ?? existing.academicYearId;
    const newSubjectId = data.subjectId ?? existing.subjectId;
    const newTermName = data.termName?.trim() ?? existing.termName;

    if (
      data.boardId ||
      data.academicYearId ||
      data.subjectId ||
      data.termName
    ) {
      const duplicate = await prisma.examConfig.findFirst({
        where: {
          boardId: newBoardId,
          academicYearId: newYearId,
          subjectId: newSubjectId || null,
          termName: newTermName,
          id: { not: Number(id) },
        },
      });
      if (duplicate) {
        return sendError(
          res,
          409,
          "Update would create duplicate config",
          "DUPLICATE_CONFIG",
        );
      }
    }

    // Re-check weightage total if changed
    if (
      data.weightage !== undefined &&
      data.weightage !== existing.weightage &&
      existing.subjectId
    ) {
      const otherWeightage = await prisma.examConfig.aggregate({
        where: {
          boardId: newBoardId,
          academicYearId: newYearId,
          subjectId: newSubjectId || existing.subjectId,
          id: { not: Number(id) },
        },
        _sum: { weightage: true },
      });
      const newTotal = (otherWeightage._sum.weightage || 0) + data.weightage;
      if (newTotal > 100) {
        return sendError(
          res,
          400,
          `Total weightage would exceed 100% (${newTotal}%)`,
          "WEIGHTAGE_OVERFLOW",
        );
      }
    }

    const updatedConfig = await prisma.examConfig.update({
      where: { id: Number(id) },
      data: {
        ...data,
        termName: data.termName ? data.termName.trim() : undefined,
        updatedById: req.user.id,
      },
      include: {
        board: { select: { name: true } },
        academicYear: { select: { label: true } },
        subject: true,
        gradingScheme: true,
      },
    });

    return sendSuccess(
      res,
      200,
      updatedConfig,
      "Exam config updated successfully",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return sendError(res, 400, messages, "VALIDATION_ERROR");
    }

    console.error("Full error in updateExamConfig:", err);

    if (err.code === "P2003") {
      return sendError(
        res,
        400,
        "Invalid reference (boardId or academicYearId not found)",
        "INVALID_REFERENCE",
      );
    }
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Duplicate config (unique constraint violation)",
        "DUPLICATE_CONFIG",
      );
    }

    return sendError(
      res,
      500,
      "Failed to update exam config",
      err.message || "Unknown error",
    );
  }
};

// 4. Soft Delete Exam Config (Admin only)
export const deleteExamConfig = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.user.role !== "ADMIN") {
      return sendError(
        res,
        403,
        "Only Admin can delete exam configs",
        "FORBIDDEN",
      );
    }

    const config = await prisma.examConfig.findFirst({
      where: { id: Number(id), isDeleted: false },
      include: {
        _count: {
          select: { examTerms: true },
        },
      },
    });

    if (!config) {
      return sendError(
        res,
        404,
        "Exam config not found or already deleted",
        "NOT_FOUND",
      );
    }

    if (config._count.examTerms > 0) {
      return sendError(
        res,
        409,
        "Cannot delete config - it is used in exam terms",
        "DEPENDENCY_CONFLICT",
      );
    }

    await prisma.examConfig.update({
      where: { id: Number(id) },
      data: {
        isDeleted: true,
        updatedById: req.user.id,
      },
    });

    return sendSuccess(res, 200, null, "Exam config soft-deleted successfully");
  } catch (err) {
    console.error("Delete exam config error:", err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Exam config not found", "NOT_FOUND");
    }
    return sendError(
      res,
      500,
      "Failed to delete exam config",
      err.message || "Internal error",
    );
  }
};

// ────────────────────────────────────────────────
// Grading Scheme CRUD
// ────────────────────────────────────────────────

// 5. Create Grading Scheme (Admin only)
export const createGradingScheme = async (req, res) => {
  try {
    const data = createGradingSchemeSchema.parse(req.body);

    // Validate board exists
    const board = await prisma.board.findUnique({
      where: { id: data.boardId },
    });
    if (!board) return sendError(res, 404, "Board not found", "NOT_FOUND");

    // Validate academic year exists
    const year = await prisma.academicYear.findUnique({
      where: { id: data.academicYearId },
    });
    if (!year)
      return sendError(res, 404, "Academic year not found", "NOT_FOUND");

    // Prevent overlapping ranges
    const overlapping = await prisma.gradingScheme.findFirst({
      where: {
        boardId: data.boardId,
        academicYearId: data.academicYearId,
        OR: [
          {
            minPercent: { lte: data.maxPercent },
            maxPercent: { gte: data.minPercent },
          },
        ],
      },
    });

    if (overlapping) {
      return sendError(
        res,
        409,
        `Grading range ${data.minPercent}–${data.maxPercent} overlaps with existing scheme`,
        "GRADE_RANGE_OVERLAP",
      );
    }

    const scheme = await prisma.gradingScheme.create({
      data: {
        ...data,
        createdById: req.user.id,
        updatedById: req.user.id,
      },
      include: {
        board: { select: { name: true } },
        academicYear: { select: { label: true } },
      },
    });

    return sendSuccess(res, 201, scheme, "Grading scheme created successfully");
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return sendError(res, 400, messages, "VALIDATION_ERROR");
    }

    console.error("Full error in createGradingScheme:", err);

    if (err.code === "P2003") {
      return sendError(
        res,
        400,
        "Invalid reference (boardId or academicYearId not found)",
        "INVALID_REFERENCE",
      );
    }
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Duplicate grading scheme (unique constraint violation)",
        "DUPLICATE_ENTRY",
      );
    }

    return sendError(
      res,
      500,
      "Failed to create grading scheme",
      err.message || "Unknown error",
    );
  }
};

// 6. Get Grading Schemes (filter by board/year)
export const getGradingSchemes = async (req, res) => {
  const { boardId, academicYearId } = req.query;

  try {
    const where = {
      boardId: boardId ? Number(boardId) : undefined,
      academicYearId: academicYearId ? Number(academicYearId) : undefined,
      isDeleted: false,
    };

    const schemes = await prisma.gradingScheme.findMany({
      where,
      include: {
        board: { select: { id: true, name: true } },
        academicYear: { select: { label: true } },
        createdBy: { select: { id: true, email: true } },
        updatedBy: { select: { id: true, email: true } },
      },
      orderBy: [
        { academicYear: { startDate: "desc" } },
        { minPercent: "desc" },
      ],
    });

    return sendSuccess(
      res,
      200,
      schemes,
      "Grading schemes fetched successfully",
      {
        total: schemes.length,
      },
    );
  } catch (err) {
    console.error("Get grading schemes error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch grading schemes",
      err.message || "Internal error",
    );
  }
};

// 7. Get Single Grading Scheme
export const getGradingSchemeById = async (req, res) => {
  const { id } = req.params;

  try {
    const scheme = await prisma.gradingScheme.findFirst({
      where: { id: Number(id), isDeleted: false },
      include: {
        board: { select: { id: true, name: true } },
        academicYear: { select: { label: true } },
        createdBy: { select: { id: true, email: true } },
        updatedBy: { select: { id: true, email: true } },
      },
    });

    if (!scheme) {
      return sendError(
        res,
        404,
        "Grading scheme not found or deleted",
        "NOT_FOUND",
      );
    }

    return sendSuccess(res, 200, scheme, "Grading scheme fetched successfully");
  } catch (err) {
    console.error("Get grading scheme error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch grading scheme",
      err.message || "Internal error",
    );
  }
};
