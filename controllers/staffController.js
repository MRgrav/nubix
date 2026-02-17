import prisma from "../models/prisma.js";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "./authController.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import z from "zod";
import { sendError, sendSuccess } from "../utils/responseStructure.js";

// Zod schema
const createStaffSchema = z.object({
  email: z.string().email("Invalid email").trim().toLowerCase(),
  name: z.string().min(2, "Name is required and must be at least 2 characters"),
  schoolId: z.number().int().positive("Invalid school ID"),
  employeeId: z.string().optional(),
  title: z.string().optional(),
  gender: z.string().optional(),
  employeeType: z.string().optional(),
  role: z.string().optional(),
  designation: z.string().optional(),
  dateOfBirth: z.string().optional(),
  dateOfJoining: z.string().optional(),
  fatherHusbandName: z.string().optional(),
  qualification: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  location: z.string().optional(),
  aadharNumber: z.string().optional(),
  panNumber: z.string().optional(),
  mobile: z.string().optional(),
  alternateMobile: z.string().optional(),
  alternateEmail: z.string().optional(),
  brokerBranch: z.string().optional(),
  bankName: z.string().optional(),
  bankBranchName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  // Document URLs
  jobOfferLetterUrl: z.string().url().optional(),
  joiningLetterUrl: z.string().url().optional(),
  ndaUrl: z.string().url().optional(),
  experienceLetterUrl: z.string().url().optional(),
  relievingLetterUrl: z.string().url().optional(),
  salarySlipUrl: z.string().url().optional(),
  aadhaarCardUrl: z.string().url().optional(),
  panCardUrl: z.string().url().optional(),
  cancelledChequeUrl: z.string().url().optional(),
  passportUrl: z.string().url().optional(),
  sscCertificateUrl: z.string().url().optional(),
  hscCertificateUrl: z.string().url().optional(),
  graduationCertificateUrl: z.string().url().optional(),
});

const updateStaffSchema = createStaffSchema.partial();

const sanitizeString = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const parseDateField = (value, field) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`Invalid date for ${field}`);
    error.code = "INVALID_DATE";
    error.meta = { field };
    throw error;
  }
  return parsed;
};

const buildStaffPayload = (data, isUpdate = false) => {
  const payload = {};

  [
    "employeeId",
    "title",
    "gender",
    "employeeType",
    "role",
    "designation",
    "fatherHusbandName",
    "qualification",
    "address",
    "city",
    "state",
    "pincode",
    "location",
    "aadharNumber",
    "panNumber",
    "mobile",
    "alternateMobile",
    "alternateEmail",
    "brokerBranch",
    "bankName",
    "bankBranchName",
    "bankAccountNumber",
    "ifscCode",
    "jobOfferLetterUrl",
    "joiningLetterUrl",
    "ndaUrl",
    "experienceLetterUrl",
    "relievingLetterUrl",
    "salarySlipUrl",
    "aadhaarCardUrl",
    "panCardUrl",
    "cancelledChequeUrl",
    "passportUrl",
    "sscCertificateUrl",
    "hscCertificateUrl",
    "graduationCertificateUrl",
  ].forEach((field) => {
    if (data[field] !== undefined) {
      payload[field] = sanitizeString(data[field]);
    }
  });

  if (data.dateOfBirth !== undefined) {
    payload.dateOfBirth = parseDateField(data.dateOfBirth, "dateOfBirth");
  }
  if (data.dateOfJoining !== undefined) {
    payload.dateOfJoining = parseDateField(data.dateOfJoining, "dateOfJoining");
  }

  return payload;
};

export const createStaff = async (req, res) => {
  try {
    const validated = createStaffSchema.parse(req.body);
    const { email, name, schoolId } = validated;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    // Prevent duplicate email
    const [existingUser, existingStaff] = await Promise.all([
      prisma.user.findUnique({ where: { email: normalizedEmail } }),
      prisma.staff.findUnique({ where: { email: normalizedEmail } }),
    ]);

    if (existingUser || existingStaff) {
      return sendError(res, 409, "Email already registered", "EMAIL_CONFLICT");
    }

    const staffData = buildStaffPayload(validated);

    const tempPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          role: "STAFF",
          school: { connect: { id: parseInt(schoolId) } },
        },
      });

      const staff = await tx.staff.create({
        data: {
          ...staffData,
          name: normalizedName, // ← required field
          email: normalizedEmail,
          school: { connect: { id: parseInt(schoolId) } },
          user: { connect: { id: user.id } },
        },
        include: {
          school: { select: { id: true, name: true, schoolCode: true } },
          user: { select: { id: true, email: true, role: true } },
        },
      });

      return { staff, tempPassword };
    });

    return sendSuccess(
      res,
      201,
      {
        staff: result.staff,
        credentials: {
          email: result.staff.email,
          temporaryPassword: result.tempPassword,
          note: "Please share securely. User must change password on first login.",
        },
      },
      "Staff member created successfully",
    );
  } catch (err) {
    console.error("Create staff error:", err);

    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Email or unique field conflict",
        "DUPLICATE_ENTRY",
      );
    }

    return sendError(
      res,
      500,
      "Failed to create staff member",
      "INTERNAL_ERROR",
    );
  }
};

export const getStaffs = async (req, res) => {
  const { schoolId, role, page = 1, limit = 20, search } = req.query;

  try {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (schoolId) where.schoolId = parseInt(schoolId);
    if (role) where.role = role;

    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const total = await prisma.staff.count({ where });

    let staffList = await prisma.staff.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        school: { select: { id: true, name: true } },
        subjects: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
      orderBy: { name: "asc" },
    });

    // Optional: Add timetable count for current active year
    let activeYearId = null;
    if (schoolId || req.user.schoolId) {
      const activeYear = await getActiveAcademicYear(
        parseInt(schoolId || req.user.schoolId),
      );
      activeYearId = activeYear?.id;
    }

    if (activeYearId) {
      staffList = await Promise.all(
        staffList.map(async (staff) => {
          const count = await prisma.timetableSlot.count({
            where: {
              teacherId: staff.id,
              academicYearId: activeYearId,
            },
          });
          return { ...staff, timetablePeriods: count };
        }),
      );
    }

    const totalPages = Math.ceil(total / limitNum);

    return sendSuccess(res, 200, staffList, "Staff list fetched successfully", {
      pagination: {
        total,
        totalPages,
        currentPage: pageNum,
        perPage: limitNum,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (err) {
    console.error("Get staff error:", err);
    return sendError(res, 500, "Failed to fetch staff list", "INTERNAL_ERROR");
  }
};

export const getStaffMember = async (req, res) => {
  const { id } = req.params;
  try {
    const staffId = parseInt(id);
    if (isNaN(staffId)) {
      return sendError(res, 400, "Invalid staff ID", "INVALID_ID");
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        subjects: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, email: true, role: true } },
      },
    });

    if (!staff) {
      return sendError(res, 404, "Staff member not found", "NOT_FOUND");
    }

    const activeYear = await getActiveAcademicYear(staff.schoolId);

    const timetableSlots = activeYear
      ? await prisma.timetableSlot.findMany({
          where: {
            teacherId: staff.id,
            academicYearId: activeYear.id,
          },
          include: {
            classroom: { select: { name: true, section: true } },
            subject: true,
            academicYear: { select: { label: true } },
          },
          orderBy: [{ day: "asc" }, { startMinutes: "asc" }],
        })
      : [];

    return sendSuccess(
      res,
      200,
      {
        staff,
        currentAcademicYear: activeYear ? activeYear.label : null,
        timetableSlots,
        totalPeriods: timetableSlots.length,
      },
      "Staff member details fetched successfully",
    );
  } catch (err) {
    console.error("Get staff member error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch staff member",
      "INTERNAL_ERROR",
    );
  }
};

export const getMinimalTeachers = async (req, res) => {
  const { schoolId, search, limit = 100 } = req.query;

  try {
    const where = { role: "TEACHER" };

    // Restrict to user's school (unless super-admin)
    if (req.user.role !== "SUPER_ADMIN" && req.user.schoolId) {
      where.schoolId = req.user.schoolId;
    } else if (schoolId) {
      where.schoolId = parseInt(schoolId);
    }

    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const teachers = await prisma.staff.findMany({
      where,
      select: {
        id: true,
        userId: true,
        name: true,
        email: true,
        designation: true,
      },
      orderBy: { name: "asc" },
      take: Math.min(parseInt(limit) || 100, 500),
    });

    return sendSuccess(
      res,
      200,
      teachers,
      "Teacher user IDs fetched successfully",
    );
  } catch (err) {
    console.error("Get teachers user-ids error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch teacher user IDs",
      "INTERNAL_ERROR",
    );
  }
};

export const updateStaffMember = async (req, res) => {
  const { id } = req.params;

  try {
    const staffId = parseInt(id);
    if (isNaN(staffId)) return sendError(res, 400, "Invalid staff ID");

    const validated = updateStaffSchema.parse(req.body);
    const staffData = buildStaffPayload(validated, true);

    if (req.body.schoolId) {
      staffData.school = { connect: { id: parseInt(req.body.schoolId) } };
    }

    const staff = await prisma.staff.update({
      where: { id: staffId },
      data: staffData,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        user: { select: { email: true } },
      },
    });

    return sendSuccess(res, 200, staff, "Staff member updated successfully");
  } catch (err) {
    console.error("Update staff error:", err);

    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }

    if (err.code === "P2025") {
      return sendError(res, 404, "Staff member not found", "NOT_FOUND");
    }

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Email or unique field already in use",
        "CONFLICT",
      );
    }

    return sendError(
      res,
      500,
      "Failed to update staff member",
      "INTERNAL_ERROR",
    );
  }
};

export const deleteStaffMember = async (req, res) => {
  const { id } = req.params;

  try {
    const staffId = parseInt(id);
    if (isNaN(staffId)) return sendError(res, 400, "Invalid staff ID");

    // Optional: Check if staff exists and belongs to same school
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, schoolId: true },
    });

    if (!staff) {
      return sendError(res, 404, "Staff member not found", "NOT_FOUND");
    }

    if (req.user.schoolId && req.user.schoolId !== staff.schoolId) {
      return sendError(
        res,
        403,
        "Not authorized to delete this staff member",
        "FORBIDDEN",
      );
    }

    await prisma.$transaction([
      prisma.timetableSlot.deleteMany({ where: { teacherId: staffId } }),
      prisma.staff.delete({ where: { id: staffId } }),
      // Add more cascades if needed (e.g., teacherAssignments, etc.)
    ]);

    return sendSuccess(
      res,
      200,
      null,
      "Staff member and related records deleted successfully",
    );
  } catch (err) {
    console.error("Delete staff error:", err);

    if (err.code === "P2025") {
      return sendError(res, 404, "Staff member not found", "NOT_FOUND");
    }

    return sendError(
      res,
      500,
      "Failed to delete staff member",
      "INTERNAL_ERROR",
    );
  }
};
