import prisma from "../models/prisma.js";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "../controllers/authController.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import jwt from "jsonwebtoken";

export const createParent = async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return sendError(
      res,
      403,
      "Only administrators can create parents",
      "FORBIDDEN"
    );
  }

  const {
    type,
    name,
    email,
    phone,
    address,
    studentId,
    isPrimary = false,
  } = req.body;

  if (!type || !name || !email) {
    return sendError(
      res,
      400,
      "type, name, and email are required",
      "VALIDATION_ERROR"
    );
  }

  try {
    // Check duplicate email
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser)
      return res.status(409).json({ error: "Email already registered" });

    const tempPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, password: hashedPassword, role: "PARENT" },
      });

      const parent = await tx.parent.create({
        data: {
          type,
          name: name.trim(),
          email,
          phone,
          address,
          user: { connect: { id: user.id } },
        },
      });

      // Optional: Link to student
      let link = null;
      if (studentId) {
        link = await tx.studentParent.create({
          data: {
            studentId: parseInt(studentId),
            parentId: parent.id,
            isPrimary,
          },
        });
      }

      return { parent, tempPassword, link };
    });

    return sendSuccess(
      res,
      201,
      {
        parent: result.parent,
        temporaryPassword: result.tempPassword,
        ...(result.link && { link: result.link }),
      },
      "Parent created successfully"
    );
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return sendError(res, 409, "Email conflict", "EMAIL_CONFLICT");
    }
    return sendError(res, 500, "Failed to create parent", "INTERNAL_ERROR");
  }
};

export const getParents = async (req, res) => {
  if (!["ADMIN", "STAFF"].includes(req.user.role)) {
    return sendError(res, 403, "Unauthorized", "FORBIDDEN");
  }
  const { studentId } = req.query;
  try {
    const where = studentId
      ? { students: { some: { studentId: parseInt(studentId) } } }
      : {};
    const parents = await prisma.parent.findMany({
      where,
      include: {
        user: { select: { email: true } },
        students: { include: { student: { select: { name: true } } } },
      },
    });

    return sendSuccess(res, 200, { parents }, "Parents fetched successfully");
  } catch (err) {
    return sendError(res, 500, "Failed to fetch parents", "INTERNAL_ERROR");
  }
};

// Get my children (Parent only)
export const getMyChildren = async (req, res) => {
  if (req.user.role !== "PARENT") {
    return sendError(res, 403, "Parents only", "FORBIDDEN");
  }

  try {
    const activeYear = await getActiveAcademicYear(req.user.schoolId);
    const activeYearId = activeYear?.id;

    const parent = await prisma.parent.findFirst({
      where: { userId: req.user.id },
      include: {
        students: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                grade: true,
                classroom: { select: { id: true, name: true, section: true } },
                school: { select: { id: true, name: true } },
                ...(activeYearId && {
                  studentStreams: {
                    where: { academicYearId: activeYearId },
                    select: {
                      rollNo: true,
                      stream: { select: { name: true } },
                    },
                  },
                }),
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return sendError(res, 404, "Parent profile not found", "NOT_FOUND");
    }

    const children = parent.students.map((link) => {
      const activeStream = link.student.studentStreams?.[0] || null;

      return {
        studentId: link.student.id,
        name: link.student.name,
        grade: link.student.grade,
        school: link.student.school,
        classroom: activeStream?.classroom || link.student.classroom,
        rollNo: activeStream?.rollNo || null,
        stream: activeStream?.stream || null,
        isPrimary: link.isPrimary,
      };
    });

    return sendSuccess(res, 200, { children }, "Your children fetched");
  } catch (err) {
    return sendError(res, 500, "Failed to fetch children", "INTERNAL_ERROR");
  }
};

export const selectChild = async (req, res) => {
  console.log("[selectChild] Request received");
  console.log("[selectChild] Auth user:", req.user);

  if (req.user.role !== "PARENT") {
    console.warn("[selectChild] Forbidden: role is not PARENT", req.user.role);
    return sendError(res, 403, "Parents only", "FORBIDDEN");
  }

  const { studentId } = req.body;
  console.log("[selectChild] studentId from body:", studentId);

  if (!studentId) {
    console.warn("[selectChild] Validation failed: studentId missing");
    return sendError(res, 400, "studentId required", "VALIDATION_ERROR");
  }

  try {
    console.log("[selectChild] Checking parent-student link", {
      parentUserId: req.user.userId,
      studentId: parseInt(studentId),
    });

    const link = await prisma.studentParent.findFirst({
      where: {
        parent: { userId: req.user.userId },
        studentId: parseInt(studentId),
      },
    });

    console.log("[selectChild] Link lookup result:", link);

    if (!link) {
      console.warn("[selectChild] Forbidden: parent not linked to student", {
        parentUserId: req.user.userId,
        studentId,
      });
      return sendError(res, 403, "Not linked to this student", "FORBIDDEN");
    }

    console.log("[selectChild] Generating new JWT with actingAsStudentId");

    const newToken = jwt.sign(
      {
        userId: req.user.userId,
        role: req.user.role,
        schoolId: req.user.schoolId || null,
        actingAsStudentId: parseInt(studentId),
      },
      process.env.JWT_SECRET,
      { expiresIn: "3h" }
    );

    console.log("[selectChild] Token generated successfully");

    return sendSuccess(
      res,
      200,
      { token: newToken },
      "Now acting as selected child"
    );
  } catch (err) {
    console.error("[selectChild] Unexpected error:", err);
    return sendError(res, 500, "Failed to select child", "INTERNAL_ERROR");
  }
};

// Update parent (ADMIN only, or self if parent)
export const updateParent = async (req, res) => {
  const { id } = req.params;
  const { type, name, phone, address } = req.body;

  try {
    const parent = await prisma.parent.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    });

    if (!parent) {
      return sendError(res, 404, "Parent not found", "NOT_FOUND");
    }

    // Admin can update any parent
    // Parent can only update their own profile
    if (req.user.role !== "ADMIN" && parent.userId !== req.user.id) {
      return sendError(
        res,
        403,
        "You can only update your own profile",
        "FORBIDDEN"
      );
    }

    const updated = await prisma.parent.update({
      where: { id: parseInt(id) },
      data: {
        type: type || undefined,
        name: name ? name.trim() : undefined,
        phone,
        address,
      },
    });

    return sendSuccess(res, 200, updated, "Parent updated successfully");
  } catch (err) {
    if (err.code === "P2025") {
      return sendError(res, 404, "Parent not found", "NOT_FOUND");
    }
    return sendError(res, 500, "Failed to update parent", "INTERNAL_ERROR");
  }
};

// Delete parent (ADMIN only)
export const deleteParent = async (req, res) => {
  const { id } = req.params;

  if (req.user.role !== "ADMIN") {
    return sendError(
      res,
      403,
      "Only administrators can delete parents",
      "FORBIDDEN"
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Delete links first
      await tx.studentParent.deleteMany({
        where: { parentId: parseInt(id) },
      });

      // Delete parent
      await tx.parent.delete({
        where: { id: parseInt(id) },
      });
    });

    return sendSuccess(res, 200, null, "Parent and links deleted successfully");
  } catch (err) {
    if (err.code === "P2025") {
      return sendError(res, 404, "Parent not found", "NOT_FOUND");
    }
    return sendError(res, 500, "Failed to delete parent", "INTERNAL_ERROR");
  }
};
