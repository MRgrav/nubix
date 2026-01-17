import prisma from "../models/prisma.js";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "./authController.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";

const OPTIONAL_STRING_FIELDS = [
  "employeeId",
  "title",
  "name",
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
  "email",
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
];

const sanitizeString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const parseDateField = (value, field) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`Invalid ${field}`);
    error.code = "INVALID_DATE";
    error.meta = { field };
    throw error;
  }
  return parsed;
};

const buildStaffPayload = (body) => {
  const data = {};

  OPTIONAL_STRING_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = sanitizeString(body[field]);
    }
  });

  const dateOfBirth = parseDateField(body.dateOfBirth, "dateOfBirth");
  if (dateOfBirth !== undefined) {
    data.dateOfBirth = dateOfBirth;
  }

  const dateOfJoining = parseDateField(body.dateOfJoining, "dateOfJoining");
  if (dateOfJoining !== undefined) {
    data.dateOfJoining = dateOfJoining;
  }

  return data;
};

export const createStaff = async (req, res) => {
  const { schoolId, email } = req.body;

  if (!email || !schoolId) {
    return res.status(400).json({ error: "Email and schoolId are required" });
  }

  try {
    // Prevent duplicate email in User table
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "Email already registered in system" });
    }

    // Prevent duplicate staff email
    const existingStaff = await prisma.staff.findUnique({ where: { email } });
    if (existingStaff) {
      return res
        .status(400)
        .json({ error: "Staff member with this email already exists" });
    }

    const staffData = buildStaffPayload(req.body);

    // Generate secure temporary password
    const tempPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User account
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          role: "STAFF",
          school: { connect: { id: parseInt(schoolId) } },
        },
      });

      // 2. Create Staff profile and link to User
      const staffPayload = {
        ...staffData,
        email: email.toLowerCase().trim(),
        school: { connect: { id: parseInt(schoolId) } },
        user: { connect: { id: user.id } }, // ← CRITICAL: Link userId
      };

      const staff = await tx.staff.create({
        data: staffPayload,
        include: {
          school: {
            select: { id: true, name: true, schoolCode: true },
          },
          user: {
            select: { id: true, email: true, role: true },
          },
        },
      });

      return { staff, tempPassword };
    });

    res.status(201).json({
      message: "Staff member created successfully",
      staff: result.staff,
      credentials: {
        email: result.staff.email,
        temporaryPassword: result.tempPassword,
        note: "Please share securely. User must change password on first login.",
      },
    });
  } catch (err) {
    console.error("Create staff error:", err);
    if (err.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Email or unique field already exists" });
    }
    if (err.code === "INVALID_DATE") {
      return res
        .status(400)
        .json({ error: err.message, field: err.meta?.field });
    }
    res.status(500).json({ error: "Failed to create staff member" });
  }
};

export const getStaff = async (req, res) => {
  const { schoolId, role } = req.query;

  try {
    const where = {};
    if (schoolId) where.schoolId = parseInt(schoolId);
    if (role) where.role = role;

    const staffList = await prisma.staff.findMany({
      where,
      include: {
        school: { select: { id: true, name: true } },
        subjects: true,
        user: { select: { email: true } },
      },
      orderBy: { name: "asc" },
    });

    // Always try to attach timetable count for current active year
    let activeYearId = null;
    if (schoolId) {
      const activeYear = await getActiveAcademicYear(parseInt(schoolId));
      activeYearId = activeYear?.id;
    }

    const staffWithCount = activeYearId
      ? await Promise.all(
          staffList.map(async (staff) => {
            const count = await prisma.timetableSlot.count({
              where: {
                teacherId: staff.id,
                academicYearId: activeYearId,
              },
            });
            return { ...staff, timetablePeriods: count };
          })
        )
      : staffList;

    res.json({ staff: staffWithCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch staff" });
  }
};

export const getStaffMember = async (req, res) => {
  const { id } = req.params;
  try {
    const staff = await prisma.staff.findUnique({
      where: { id: parseInt(id) },
      include: {
        school: true,
        subjects: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!staff) {
      return res.status(404).json({ error: "Staff member not found" });
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

    res.json({
      staff,
      currentAcademicYear: activeYear ? activeYear.label : null,
      timetableSlots,
      totalPeriods: timetableSlots.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch staff member" });
  }
};

export const updateStaffMember = async (req, res) => {
  const { id } = req.params;

  try {
    const staffData = buildStaffPayload(req.body);

    if (req.body.schoolId) {
      staffData.school = { connect: { id: parseInt(req.body.schoolId) } };
    }

    const staff = await prisma.staff.update({
      where: { id: parseInt(id) },
      data: staffData,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        user: { select: { email: true } },
      },
    });

    res.json({ message: "Staff updated successfully", staff });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Staff member not found" });
    }
    if (err.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Email or unique field already in use" });
    }
    if (err.code === "INVALID_DATE") {
      return res
        .status(400)
        .json({ error: err.message, field: err.meta?.field });
    }
    res.status(500).json({ error: "Failed to update staff member" });
  }
};

export const deleteStaffMember = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.staff.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Staff member deleted successfully" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Staff member not found" });
    }
    res.status(500).json({ error: "Failed to delete staff member" });
  }
};
