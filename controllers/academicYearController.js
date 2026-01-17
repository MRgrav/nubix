import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";

export const createAcademicYear = async (req, res) => {
  const { label, startDate, endDate, isActive = false } = req.body;

  if (!label || !startDate || !endDate) {
    return sendError(
      res,
      400,
      "label, startDate, and endDate are required",
      "VALIDATION_ERROR"
    );
  }
  try {
    const academicYear = await prisma.academicYear.create({
      data: {
        label,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive,
      },
    });
    // If active, deactivate previous
    if (isActive) {
      await prisma.academicYear.updateMany({
        where: { id: { not: academicYear.id }, isActive: true },
        data: { isActive: false },
      });
    }
    return sendSuccess(
      res,
      201,
      academicYear,
      "Academic year created successfully"
    );
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Academic year label already exists",
        "DUPLICATE_LABEL"
      );
    }
    return sendError(
      res,
      500,
      "Failed to create academic year",
      "INTERNAL_ERROR"
    );
  }
};

export const getAcademicYears = async (req, res) => {
  const { schoolId, isActive } = req.query;
  try {
    const where = {};
    if (schoolId) where.schoolId = parseInt(schoolId);
    if (isActive !== undefined) where.isActive = isActive === "true";
    const academicYears = await prisma.academicYear.findMany({
      where,
      orderBy: { startDate: "desc" },
    });

    return sendSuccess(res, 200, academicYears, "Academic years fetched");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to fetch academic years",
      "INTERNAL_ERROR"
    );
  }
};

export const getAcademicYear = async (req, res) => {
  const { id } = req.params;
  try {
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: parseInt(id) },
      include: { timetableSlots: true, examinations: true },
    });

    if (!academicYear) {
      return sendError(res, 404, "Academic year not found", "NOT_FOUND");
    }

    return sendSuccess(res, 200, academicYear, "Academic year fetched");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to fetch academic year",
      "INTERNAL_ERROR"
    );
  }
};

export const updateAcademicYear = async (req, res) => {
  const { id } = req.params;
  const { label, startDate, endDate, isActive } = req.body;

  try {
    const data = {};
    if (label) data.label = label;
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);

    if (isActive !== undefined) {
      data.isActive = isActive;

      // Enforce single active academic year
      if (isActive) {
        await prisma.academicYear.updateMany({
          where: { id: { not: Number(id) }, isActive: true },
          data: { isActive: false },
        });
      }
    }

    const academicYear = await prisma.academicYear.update({
      where: { id: Number(id) },
      data,
    });

    return sendSuccess(
      res,
      200,
      academicYear,
      "Academic year updated successfully"
    );
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Academic year not found", "NOT_FOUND");
    }
    return sendError(
      res,
      500,
      "Failed to update academic year",
      "INTERNAL_ERROR"
    );
  }
};

export const deleteAcademicYear = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.academicYear.delete({
      where: { id: Number(id) },
    });

    return sendSuccess(res, 200, null, "Academic year deleted successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Academic year not found", "NOT_FOUND");
    }
    return sendError(
      res,
      500,
      "Failed to delete academic year",
      "INTERNAL_ERROR"
    );
  }
};
