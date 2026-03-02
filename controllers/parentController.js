import prisma from "../models/prisma.js";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "../controllers/authController.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import jwt from "jsonwebtoken";
import { generateTokens } from "../controllers/authController.js";

export const createParent = async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return sendError(
      res,
      403,
      "Only administrators can create parents",
      "FORBIDDEN",
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
      "VALIDATION_ERROR",
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
      "Parent created successfully",
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

  const { studentId, page = "1", limit = "20", search } = req.query;

  try {
    // Parse and validate pagination params
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    if (isNaN(pageNum) || isNaN(limitNum)) {
      return sendError(
        res,
        400,
        "Invalid page or limit value",
        "VALIDATION_ERROR",
      );
    }

    const skip = (pageNum - 1) * limitNum;

    // Build dynamic where clause
    const where = {};

    // Filter by linked student (if provided)
    if (studentId) {
      where.students = {
        some: { studentId: parseInt(studentId) },
      };
    }

    // Optional: search by parent name or email
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    // Get total count **first** (before fetching data)
    const total = await prisma.parent.count({ where });

    // Fetch paginated parents
    const parents = await prisma.parent.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        user: { select: { email: true } },
        students: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Optional: Flatten/format response for cleaner frontend use
    const formatted = parents.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      email: p.email,
      phone: p.phone,
      address: p.address,
      linkedStudents: p.students.map((link) => ({
        studentId: link.student.id,
        studentName: link.student.name,
        isPrimary: link.isPrimary,
      })),
    }));

    return sendSuccess(
      res,
      200,
      {
        data: formatted,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1,
        },
      },
      "Parents fetched successfully",
    );
  } catch (err) {
    console.error("Error in getParents:", err);
    return sendError(res, 500, "Failed to fetch parents", "INTERNAL_ERROR");
  }
};

export const getParentById = async (req, res) => {
  const { id } = req.params;

  // 1. Authorization Check: Admin/Staff can see any, Parent can see self
  if (!["ADMIN", "STAFF", "PARENT"].includes(req.user.role)) {
    return sendError(res, 403, "Unauthorized", "FORBIDDEN");
  }

  try {
    const parent = await prisma.parent.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            schoolId: true,
          },
        },
        students: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                grade: true,
                classroom: { select: { name: true, section: true } },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return sendError(res, 404, "Parent not found", "NOT_FOUND");
    }

    // 2. Security: Ensure parents can only access their own profile
    if (req.user.role === "PARENT" && parent.userId !== req.user.userId) {
      return sendError(
        res,
        403,
        "You can only access your own profile",
        "FORBIDDEN",
      );
    }

    // 3. Format response
    const formatted = {
      ...parent,
      linkedStudents: parent.students.map((link) => ({
        studentId: link.student.id,
        studentName: link.student.name,
        grade: link.student.grade,
        classroom: link.student.classroom,
        isPrimary: link.isPrimary,
      })),
    };

    // Remove the raw students array from the response
    delete formatted.students;

    return sendSuccess(res, 200, formatted, "Parent fetched successfully");
  } catch (err) {
    console.error("Error in getParentById:", err);
    return sendError(res, 500, "Failed to fetch parent", "INTERNAL_ERROR");
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
    // Fetch parentId using userId since req.user.parentId is not set
    const parent = await prisma.parent.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!parent) {
      console.warn(
        "[selectChild] Parent profile not found for user",
        req.user.userId,
      );
      return sendError(res, 404, "Parent profile not found", "NOT_FOUND");
    }

    const parentId = parent.id;
    console.log("Fetched Parent Id:", parentId);

    console.log("[selectChild] Checking parent-student link", {
      parentUserId: req.user.userId,
      studentId: parseInt(studentId),
    });

    const link = await prisma.studentParent.findUnique({
      where: { studentId_parentId: { studentId: Number(studentId), parentId } },
    });

    console.log("[selectChild] Link lookup result:", link);

    if (!link) {
      console.warn("[selectChild] Forbidden: parent not linked to student", {
        parentUserId: req.user.userId,
        studentId,
      });
      return sendError(res, 403, "Not linked to this student", "FORBIDDEN");
    }

    console.log("[selectChild] Generating new tokens with actingAsStudentId");

    const tokens = generateTokens(
      req.user.userId,
      req.user.role,
      req.user.schoolId || null,
      parseInt(studentId),
    );

    console.log("[selectChild] Tokens generated successfully");

    return sendSuccess(res, 200, tokens, "Now acting as selected child");
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
        "FORBIDDEN",
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
      "FORBIDDEN",
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
