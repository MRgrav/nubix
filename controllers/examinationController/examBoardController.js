// controllers\examinationController\examBoardController.js
import { sendError, sendSuccess } from "../../utils/responseStructure.js";
import prisma from "./../../models/prisma.js";
import z from "zod";

// Validation schemas
const createBoardSchema = z.object({
  name: z.string().min(1, "Board name is required").max(100),
  description: z.string().optional(),
  schoolId: z.number().int().positive().optional(),
});

const updateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  schoolId: z.number().int().positive().optional().nullable(),
});

// Helper: Normalize board name to uppercase
const normalizeBoardName = (name) => name.trim().toUpperCase();

// 1. Create a new Board (Admin only)
export const createBoard = async (req, res) => {
  try {
    const data = createBoardSchema.parse(req.body);

    const normalizedName = normalizeBoardName(data.name);

    // Check uniqueness (global or per school)
    const existing = await prisma.board.findFirst({
      where: {
        name: normalizedName,
        schoolId: data.schoolId || null,
        isDeleted: false,
      },
    });

    if (existing) {
      return sendError(
        res,
        409,
        `Board "${data.name}" already exists`,
        "CONFLICT",
      );
    }

    const board = await prisma.board.create({
      data: {
        name: normalizedName,
        description: data.description?.trim() || null,
        schoolId: data.schoolId || null,
      },
      include: {
        school: data.schoolId
          ? { select: { id: true, name: true } }
          : undefined,
      },
    });

    return sendSuccess(res, 201, board, "Board created successfully");
  } catch (err) {
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    console.error("Create board error:", err);
    return sendError(res, 500, "Failed to create board", "INTERNAL_ERROR");
  }
};

// 2. Get all Boards (filtered by school, exclude deleted)
export const getBoards = async (req, res) => {
  const { schoolId } = req.query;

  try {
    const where = {
      isDeleted: false,
      ...(schoolId && { schoolId: Number(schoolId) }),
    };

    const boards = await prisma.board.findMany({
      where,
      include: {
        school: { select: { id: true, name: true } },
        _count: {
          select: {
            examConfigs: true,
            gradingSchemes: true,
            boardVersions: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return sendSuccess(res, 200, boards, "Boards fetched successfully", {
      total: boards.length,
    });
  } catch (err) {
    console.error("Get boards error:", err);
    return sendError(res, 500, "Failed to fetch boards", "INTERNAL_ERROR");
  }
};

// 3. Get single Board by ID (exclude deleted)
export const getBoard = async (req, res) => {
  const { id } = req.params;

  try {
    const board = await prisma.board.findFirst({
      where: { id: Number(id), isDeleted: false },
      include: {
        school: { select: { id: true, name: true } },
        examConfigs: {
          select: {
            id: true,
            termName: true,
            weightage: true,
            maxMarks: true,
          },
        },
        gradingSchemes: {
          select: {
            id: true,
            grade: true,
            minPercent: true,
            maxPercent: true,
          },
        },
        boardVersions: {
          include: { academicYear: { select: { label: true } } },
          orderBy: { academicYear: { startDate: "desc" } },
        },
      },
    });

    if (!board) {
      return sendError(
        res,
        404,
        "Board not found or has been deleted",
        "NOT_FOUND",
      );
    }

    return sendSuccess(res, 200, board, "Board details fetched successfully");
  } catch (err) {
    console.error("Get board error:", err);
    return sendError(res, 500, "Failed to fetch board", "INTERNAL_ERROR");
  }
};

// 4. Update Board (Admin only)
export const updateBoard = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const data = updateBoardSchema.partial().parse(updates);

    const existing = await prisma.board.findFirst({
      where: { id: Number(id), isDeleted: false },
    });

    if (!existing) {
      return sendError(
        res,
        404,
        "Board not found or has been deleted",
        "NOT_FOUND",
      );
    }

    // Prevent name conflict on update (case-insensitive)
    if (data.name) {
      const normalizedName = normalizeBoardName(data.name);
      const conflict = await prisma.board.findFirst({
        where: {
          name: normalizedName,
          id: { not: Number(id) },
          schoolId:
            data.schoolId !== undefined ? data.schoolId : existing.schoolId,
          isDeleted: false,
        },
      });
      if (conflict) {
        return sendError(
          res,
          409,
          `Board name "${data.name}" already exists`,
          "CONFLICT",
        );
      }
      data.name = normalizedName;
    }

    // If schoolId changed to null, ensure no conflict
    const finalSchoolId =
      data.schoolId !== undefined ? data.schoolId : existing.schoolId;

    const updatedBoard = await prisma.board.update({
      where: { id: Number(id) },
      data: {
        name: data.name,
        description:
          data.description !== undefined
            ? data.description?.trim() || null
            : undefined,
        schoolId: finalSchoolId,
      },
      include: {
        school: { select: { id: true, name: true } },
      },
    });

    return sendSuccess(res, 200, updatedBoard, "Board updated successfully");
  } catch (err) {
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    console.error("Update board error:", err);
    return sendError(res, 500, "Failed to update board", "INTERNAL_ERROR");
  }
};

// 5. Soft Delete Board (Admin only - restricted if used)
export const deleteBoard = async (req, res) => {
  const { id } = req.params;

  try {
    const board = await prisma.board.findFirst({
      where: { id: Number(id), isDeleted: false },
      include: {
        _count: {
          select: {
            examConfigs: true,
            gradingSchemes: true,
            boardVersions: true,
          },
        },
      },
    });

    if (!board) {
      return sendError(
        res,
        404,
        "Board not found or already deleted",
        "NOT_FOUND",
      );
    }

    if (
      board._count.examConfigs > 0 ||
      board._count.gradingSchemes > 0 ||
      board._count.boardVersions > 0
    ) {
      return sendError(
        res,
        409,
        "Cannot delete board - it is used in exam configurations, grading schemes, or versions",
        "CONFLICT",
      );
    }

    await prisma.board.update({
      where: { id: Number(id) },
      data: { isDeleted: true },
    });

    return sendSuccess(res, 200, null, "Board soft-deleted successfully");
  } catch (err) {
    console.error("Delete board error:", err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Board not found", "NOT_FOUND");
    }
    return sendError(res, 500, "Failed to delete board", "INTERNAL_ERROR");
  }
};
