import prisma from "../../models/prisma.js";
import { sendError, sendSuccess } from "../../utils/responseStructure.js";
// Late Fee Models
export const createLateFeeConfig = async (req, res) => {
  const {
    academicYearId,
    fineAmount,
    isPercentage = false,
    perPeriod = "MONTHLY",
    graceDays = 0,
  } = req.body;

  if (!academicYearId || fineAmount == null) {
    return sendError(
      res,
      400,
      "academicYearId and fineAmount are required",
      "VALIDATION_ERROR"
    );
  }

  try {
    const config = await prisma.lateFeeConfig.create({
      data: {
        academicYear: { connect: { id: parseInt(academicYearId) } },
        fineAmount,
        isPercentage,
        perPeriod,
        graceDays,
      },
    });

    return sendSuccess(res, 201, config, "Late fee configuration created");
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Late fee config already exists for this academic year",
        "DUPLICATE_CONFIG"
      );
    }
    return sendError(
      res,
      500,
      "Failed to create late fee config",
      "INTERNAL_ERROR"
    );
  }
};

export const getLateFeeConfig = async (req, res) => {
  const { academicYearId } = req.query;

  try {
    const config = await prisma.lateFeeConfig.findUnique({
      where: { academicYearId: Number(academicYearId) },
    });

    return sendSuccess(
      res,
      200,
      config || null,
      "Late fee configuration fetched"
    );
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to fetch late fee config",
      "INTERNAL_ERROR"
    );
  }
};

export const applyLateFeeToStudent = async (req, res) => {
  const { studentFeeId, amount, notes } = req.body;

  if (!studentFeeId || amount == null) {
    return sendError(
      res,
      400,
      "studentFeeId and amount are required",
      "VALIDATION_ERROR"
    );
  }

  try {
    const studentFee = await prisma.studentFee.findUnique({
      where: { id: Number(studentFeeId) },
    });

    if (!studentFee) {
      return sendError(res, 404, "Student fee record not found", "NOT_FOUND");
    }

    const lateFee = await prisma.lateFee.create({
      data: {
        studentFee: { connect: { id: Number(studentFeeId) } },
        amount,
        notes,
      },
    });

    await prisma.studentFee.update({
      where: { id: Number(studentFeeId) },
      data: { dueAmount: { increment: amount } },
    });

    return sendSuccess(res, 201, lateFee, "Late fee applied successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to apply late fee", "INTERNAL_ERROR");
  }
};

// TRANSPORT Model
export const createTransportRoute = async (req, res) => {
  const { name, feeAmount, description } = req.body;

  if (!name || feeAmount == null) {
    return sendError(
      res,
      400,
      "name and feeAmount are required",
      "VALIDATION_ERROR"
    );
  }

  try {
    const route = await prisma.transportRoute.create({
      data: { name: name.trim(), feeAmount, description },
    });

    return sendSuccess(res, 201, route, "Transport route created");
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Route name already exists",
        "DUPLICATE_ROUTE"
      );
    }
    return sendError(
      res,
      500,
      "Failed to create transport route",
      "INTERNAL_ERROR"
    );
  }
};

export const getTransportRoutes = async (req, res) => {
  try {
    const routes = await prisma.transportRoute.findMany({
      orderBy: { name: "asc" },
    });

    return sendSuccess(res, 200, routes, "Transport routes fetched");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to fetch transport routes",
      "INTERNAL_ERROR"
    );
  }
};

export const assignStudentTransport = async (req, res) => {
  const { studentId, academicYearId, routeId, startDate } = req.body;

  if (!studentId || !academicYearId || !routeId || !startDate) {
    return sendError(res, 400, "All fields are required", "VALIDATION_ERROR");
  }

  try {
    const existing = await prisma.studentTransport.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: Number(studentId),
          academicYearId: Number(academicYearId),
        },
      },
    });

    if (existing && existing.isActive) {
      return sendError(
        res,
        409,
        "Student already has active transport for this year",
        "DUPLICATE_ASSIGNMENT"
      );
    }

    const route = await prisma.transportRoute.findUnique({
      where: { id: Number(routeId) },
    });
    if (!route) {
      return sendError(res, 404, "Route not found", "NOT_FOUND");
    }

    const transport = await prisma.studentTransport.upsert({
      where: {
        studentId_academicYearId: {
          studentId: Number(studentId),
          academicYearId: Number(academicYearId),
        },
      },
      update: {
        routeId: Number(routeId),
        startDate: new Date(startDate),
        endDate: null,
        isActive: true,
      },
      create: {
        student: { connect: { id: Number(studentId) } },
        academicYear: { connect: { id: Number(academicYearId) } },
        route: { connect: { id: Number(routeId) } },
        startDate: new Date(startDate),
        isActive: true,
      },
    });

    return sendSuccess(res, 201, transport, "Transport assigned to student");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to assign transport", "INTERNAL_ERROR");
  }
};

export const optOutStudentTransport = async (req, res) => {
  const { studentId, academicYearId, endDate = new Date() } = req.body;

  try {
    const transport = await prisma.studentTransport.update({
      where: {
        studentId_academicYearId: {
          studentId: Number(studentId),
          academicYearId: Number(academicYearId),
        },
      },
      data: { isActive: false, endDate: new Date(endDate) },
    });

    return sendSuccess(res, 200, transport, "Student opted out of transport");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Transport assignment not found", "NOT_FOUND");
    }
    return sendError(res, 500, "Failed to opt out transport", "INTERNAL_ERROR");
  }
};

// FEE ADJUSTMENTS / REFUNDS

export const createFeeAdjustment = async (req, res) => {
  const { studentFeeId, type, amount, reason, notes } = req.body;

  if (!studentFeeId || !type || amount == null || !reason) {
    return sendError(
      res,
      400,
      "studentFeeId, type, amount, and reason are required",
      "VALIDATION_ERROR"
    );
  }

  try {
    const studentFee = await prisma.studentFee.findUnique({
      where: { id: Number(studentFeeId) },
    });
    if (!studentFee) {
      return sendError(res, 404, "Student fee not found", "NOT_FOUND");
    }

    const adjustment = await prisma.feeAdjustment.create({
      data: {
        studentFee: { connect: { id: Number(studentFeeId) } },
        type,
        amount,
        reason,
        notes,
        createdBy: { connect: { id: req.user.id } },
      },
    });

    await prisma.studentFee.update({
      where: { id: Number(studentFeeId) },
      data: { dueAmount: { increment: amount } },
    });

    return sendSuccess(res, 201, adjustment, "Fee adjustment created");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to create fee adjustment",
      "INTERNAL_ERROR"
    );
  }
};

export const getFeeAdjustments = async (req, res) => {
  const { studentId, academicYearId } = req.query;

  try {
    const studentFee = await prisma.studentFee.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: Number(studentId),
          academicYearId: Number(academicYearId),
        },
      },
    });

    if (!studentFee) {
      return sendError(res, 404, "Student fee not found", "NOT_FOUND");
    }

    const adjustments = await prisma.feeAdjustment.findMany({
      where: { studentFeeId: studentFee.id },
      include: { createdBy: { select: { email: true } } },
      orderBy: { adjustmentDate: "desc" },
    });

    return sendSuccess(res, 200, adjustments, "Fee adjustments fetched");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch adjustments", "INTERNAL_ERROR");
  }
};
