import prisma from "../../models/prisma.js";
import { sendSuccess, sendError } from "../../utils/responseStructure.js";
export const assignStudentFee = async (req, res) => {
  const { studentId, academicYearId, feeStructureIds } = req.body; // Array of FeeStructure IDs

  if (!studentId || !academicYearId || !feeStructureIds?.length) {
    return sendError(
      res,
      400,
      "studentId, academicYearId, and feeStructureIds (array) required",
      "VALIDATION_ERROR"
    );
  }

  try {
    const structures = await prisma.feeStructure.findMany({
      where: { id: { in: feeStructureIds.map((id) => parseInt(id)) } },
    });

    if (structures.length !== feeStructureIds.length) {
      return sendError(
        res,
        404,
        "One or more fee structures not found",
        "NOT_FOUND"
      );
    }

    const totalAmount = structures.reduce((sum, s) => sum + s.amount, 0);

    const studentFee = await prisma.studentFee.create({
      data: {
        student: { connect: { id: Number(studentId) } },
        academicYear: { connect: { id: Number(academicYearId) } },
        totalAmount,
        dueAmount: totalAmount,
        isFrozen: true,
        items: {
          create: structures.map((struct) => ({
            feeStructureId: struct.id,
            assignedAmount: struct.amount,
          })),
        },
      },
      select: {
        id: true,
        studentId: true,
        academicYearId: true,
        totalAmount: true,
        paidAmount: true,
        dueAmount: true,
        isFrozen: true,
        items: {
          select: {
            assignedAmount: true,
            feeStructure: {
              select: {
                id: true,
                amount: true,
                category: {
                  select: {
                    name: true,
                    type: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    sendSuccess(res, 201, studentFee, "Student fee assigned successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2002")
      return sendError(
        res,
        409,
        "Student fee already assigned for this year",
        "CONFLICT"
      );
    sendError(res, 500, "Failed to assign student fee", "SERVER_ERROR");
  }
};

export const getStudentFee = async (req, res) => {
  const { studentId, academicYearId } = req.query;
  try {
    const fee = await prisma.studentFee.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: parseInt(studentId),
          academicYearId: parseInt(academicYearId),
        },
      },
      select: {
        items: {
          select: {
            assignedAmount: true,
            feeStructure: {
              select: {
                id: true,
                amount: true,
                category: {
                  select: {
                    name: true,
                    type: true,
                  },
                },
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            studentFeeId: true,
            amount: true,
            paymentDate: true,
            method: true,
            receiptNo: true,
            notes: true,
          },
        },
        discounts: true,
        adjustments: true,
        lateFees: true,
      },
    });
    if (!fee) return sendError(res, 404, "Student fee not found", "NOT_FOUND");
    sendSuccess(res, 200, fee);
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to Fetch Student Fee", "SERVER_ERROR");
  }
};

export const getOutstandingDues = async (req, res) => {
  const { studentId, academicYearId } = req.query;
  try {
    const fee = await prisma.studentFee.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: parseInt(studentId),
          academicYearId: parseInt(academicYearId),
        },
      },
      select: {
        dueAmount: true,
        paidAmount: true,
        totalAmount: true,
        lastPaymentDate: true,
      },
    });
    sendSuccess(
      res,
      200,
      fee || { dueAmount: 0, paidAmount: 0, totalAmount: 0 }
    );
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to fetch outstanding dues", "SERVER_ERROR");
  }
};

export const recordPayment = async (req, res) => {
  const { studentFeeId, amount, method, receiptNo, notes } = req.body;
  if (!amount || !method)
    return sendError(
      res,
      400,
      "amount and method required",
      "VALIDATION_ERROR"
    );

  try {
    const studentFee = await prisma.studentFee.findUnique({
      where: { id: parseInt(studentFeeId) },
    });

    if (!studentFee)
      return sendError(res, 404, "Student fee not found", "NOT_FOUND");
    if (studentFee.isFrozen && amount > studentFee.dueAmount)
      return sendError(
        res,
        400,
        "Cannot overpay frozen fee",
        "VALIDATION_ERROR"
      );

    const payment = await prisma.payment.create({
      data: {
        studentFeeId: parseInt(studentFeeId),
        amount,
        method,
        receiptNo,
        notes,
      },
    });

    const updatedFee = await prisma.studentFee.update({
      where: { id: parseInt(studentFeeId) },
      data: {
        paidAmount: { increment: amount },
        dueAmount: { decrement: amount },
        lastPaymentDate: new Date(),
      },
      select: {
        dueAmount: true,
      },
    });

    sendSuccess(res, 201, payment, "Payment recorded successfully", {
      updatedDueAmount: updatedFee.dueAmount,
    });
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to record payment", "SERVER_ERROR");
  }
};

export const applyDiscount = async (req, res) => {
  const { studentFeeId, type, amount, percentage, reason } = req.body;
  if (
    !type ||
    !reason ||
    (type === "FIXED" && !amount) ||
    (type === "PERCENTAGE" && !percentage)
  )
    return sendError(res, 400, "Invalid discount data", "VALIDATION_ERROR");

  try {
    const studentFee = await prisma.studentFee.findUnique({
      where: { id: parseInt(studentFeeId) },
    });

    if (studentFee.isFrozen)
      return sendError(
        res,
        403,
        "Cannot apply discount to frozen fee",
        "FORBIDDEN"
      );

    const discountAmount =
      type === "PERCENTAGE"
        ? (percentage / 100) * studentFee.dueAmount
        : amount;

    const discount = await prisma.discount.create({
      data: {
        studentFeeId: parseInt(studentFeeId),
        type,
        amount: type === "FIXED" ? amount : null,
        percentage: type === "PERCENTAGE" ? percentage : null,
        reason,
        createdBy: { connect: { id: req.user.id } },
      },
    });

    const updatedFee = await prisma.studentFee.update({
      where: { id: parseInt(studentFeeId) },
      data: {
        dueAmount: { decrement: discountAmount },
        totalAmount: { decrement: discountAmount },
      },
      select: {
        dueAmount: true,
      },
    });

    sendSuccess(res, 201, discount, "Discount applied successfully", {
      discountAmount,
      updatedDueAmount: updatedFee.dueAmount,
    });
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to apply discount", "SERVER_ERROR");
  }
};
