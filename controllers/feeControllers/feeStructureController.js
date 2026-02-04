import prisma from "../../models/prisma.js";
import { getActiveAcademicYear } from "../../utils/academicYearHelper.js";
import { sendError, sendSuccess } from "../../utils/responseStructure.js";

export const createFeeStructure = async (req, res) => {
  const { academicYearId, className, streamId, categoryId, amount } = req.body;
  if (!className || !categoryId || amount == null)
    return sendError(
      res,
      400,
      "className, categoryId, and amount are required",
      "VALIDATION_ERROR",
    );

  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(req.user.schoolId);
      if (!activeYear)
        return sendError(
          res,
          400,
          "No active academic year found",
          "ACADEMIC_YEAR_MISSING",
        );
      resolvedAcademicYearId = activeYear.id;
    }

    const structure = await prisma.feeStructure.create({
      data: {
        academicYear: { connect: { id: resolvedAcademicYearId } },
        className: className.trim(),
        stream: streamId ? { connect: { id: parseInt(streamId) } } : undefined,
        category: { connect: { id: parseInt(categoryId) } },
        amount,
      },
    });

    return sendSuccess(
      res,
      201,
      structure,
      "Fee structure created successfully",
    );
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Fee structure already exists for this combination",
        "DUPLICATE_STRUCTURE",
      );
    }
    return sendError(
      res,
      500,
      "Failed to create fee structure",
      "INTERNAL_ERROR",
    );
  }
};

export const getFeeStructures = async (req, res) => {
  const { academicYearId, className, streamId } = req.query;

  try {
    const where = {};
    if (academicYearId) where.academicYearId = Number(academicYearId);
    if (className) where.className = className.trim();
    if (streamId) where.streamId = Number(streamId);

    const structures = await prisma.feeStructure.findMany({
      where,
      include: {
        category: true,
        stream: true,
        academicYear: { select: { label: true } },
      },
      orderBy: { className: "asc" },
    });

    return sendSuccess(res, 200, structures, "Fee structures fetched");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to fetch fee structures",
      "INTERNAL_ERROR",
    );
  }
};
export const getFeeStructureReport = async (req, res) => {
  const { academicYearId, className } = req.query;
  if (!academicYearId) {
    return sendError(
      res,
      400,
      "academicYearId is required",
      "VALIDATION_ERROR",
    );
  }
  try {
    const aggregates = await prisma.feeStructure.groupBy({
      by: ["className", "streamId"],
      where: {
        academicYearId: Number(academicYearId),
        ...(className && { className: className.trim() }),
      },
      _sum: { amount: true },
      orderBy: { className: "asc" },
    });
    const enrichedAggregates = await Promise.all(
      aggregates.map(async (agg) => ({
        ...agg,
        stream: agg.streamId
          ? await prisma.stream.findUnique({
              where: { id: agg.streamId },
              select: { name: true },
            })
          : null,
        totalAmount: agg._sum.amount,
      })),
    );
    return sendSuccess(
      res,
      200,
      enrichedAggregates,
      "Fee structure report generated",
    );
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to generate fee structure report",
      "INTERNAL_ERROR",
    );
  }
};
export const updateFeeStructure = async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  try {
    const structure = await prisma.feeStructure.findUnique({
      where: { id: Number(id) },
    });

    if (!structure) {
      return sendError(res, 404, "Fee structure not found", "NOT_FOUND");
    }

    if (structure.isLocked) {
      return sendError(res, 403, "Fee structure is locked", "STRUCTURE_LOCKED");
    }

    const updated = await prisma.feeStructure.update({
      where: { id: Number(id) },
      data: { amount },
    });

    return sendSuccess(res, 200, updated, "Fee structure updated");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to update fee structure",
      "INTERNAL_ERROR",
    );
  }
};

export const lockFeeStructure = async (req, res) => {
  const { id } = req.params;

  try {
    const updated = await prisma.feeStructure.update({
      where: { id: Number(id) },
      data: { isLocked: true },
    });

    return sendSuccess(res, 200, updated, "Fee structure locked successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Fee structure not found", "NOT_FOUND");
    }
    return sendError(
      res,
      500,
      "Failed to lock fee structure",
      "INTERNAL_ERROR",
    );
  }
};
