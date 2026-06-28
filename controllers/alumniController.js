// controllers\alumniController.js
import prisma from "../models/prisma.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";
import { z } from "zod";
import jwt from "jsonwebtoken";

const alumniSubmissionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  graduationYear: z.coerce.number().int().min(1900).max(2100),
  course: z.string().min(1, "Course is required"),
  currentStatus: z.string().min(1, "Current status is required"),
  organization: z.string().optional(),
  designation: z.string().optional(),
  location: z.string().optional(),

  // New: History fields (optional)
  educationHistory: z
    .array(
      z.object({
        level: z.string(), // e.g., "Class 10", "Class 12", "B.Tech", "M.Tech"
        school: z.string().optional(),
        university: z.string().optional(),
        year: z.number().int(),
        percentage: z.number().optional(),
      }),
    )
    .optional()
    .default([]),

  employmentHistory: z
    .array(
      z.object({
        company: z.string(),
        designation: z.string(),
        fromYear: z.number().int(),
        toYear: z.number().int().optional(),
        location: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

const alumniUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  currentStatus: z.string().optional(),
  organization: z.string().optional(),
  designation: z.string().optional(),
  location: z.string().optional(),
});

// ─── ALUMNI LOGIN (email/phone + dateOfBirth) ──────────────────────────
export const alumniLogin = async (req, res) => {
  try {
    const { identifier, dateOfBirth } = req.body;

    if (!identifier || !dateOfBirth) {
      return sendError(res, 400, "Email/Phone and Date of Birth are required");
    }

    const alumni = await prisma.alumniProfile.findFirst({
      where: {
        OR: [
          { email: identifier.trim().toLowerCase() },
          { phone: identifier.trim() },
        ],
      },
    });

    if (!alumni) return sendError(res, 401, "Invalid credentials");

    if (
      new Date(dateOfBirth).toDateString() !==
      new Date(alumni.dateOfBirth).toDateString()
    ) {
      return sendError(res, 401, "Invalid credentials");
    }

    const token = jwt.sign(
      {
        id: alumni.id,
        alumniId: alumni.id, // Important
        role: "ALUMNI",
        email: alumni.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    return sendSuccess(
      res,
      200,
      {
        token,
        alumni: {
          id: alumni.id,
          name: alumni.name,
          email: alumni.email,
          phone: alumni.phone,
          graduationYear: alumni.graduationYear,
          course: alumni.course,
        },
      },
      "Login successful",
    );
  } catch (err) {
    console.error("Alumni login error:", err);
    return sendError(res, 500, "Login failed");
  }
};

// ─── PUBLIC: Submit New Alumni ───────────────────────────────────────────
export const submitAlumni = async (req, res) => {
  try {
    const parsed = alumniSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        parsed.error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }

    const { email } = parsed.data;

    // Check if email already exists in AlumniProfile (verified alumni)
    const existingProfile = await prisma.alumniProfile.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (existingProfile) {
      return sendError(
        res,
        409,
        "An alumni profile with this email already exists",
        "EMAIL_ALREADY_EXISTS",
      );
    }

    // Optional: Also check if there's a pending submission with same email
    const existingSubmission = await prisma.alumniSubmission.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        status: "PENDING",
      },
    });

    if (existingSubmission) {
      return sendError(
        res,
        409,
        "A submission with this email is already pending approval",
        "PENDING_SUBMISSION_EXISTS",
      );
    }

    const submission = await prisma.alumniSubmission.create({
      data: {
        name: parsed.data.name,
        email: email.trim().toLowerCase(), // Normalize email
        phone: parsed.data.phone,
        dateOfBirth: new Date(parsed.data.dateOfBirth),
        graduationYear: parsed.data.graduationYear,
        course: parsed.data.course,
        currentStatus: parsed.data.currentStatus,
        organization: parsed.data.organization,
        designation: parsed.data.designation,
        location: parsed.data.location,

        // History fields
        educationHistory: parsed.data.educationHistory || [],
        employmentHistory: parsed.data.employmentHistory || [],

        type: "INITIAL",
        status: "PENDING",
      },
    });

    return sendSuccess(
      res,
      201,
      submission,
      "Alumni submission received. Awaiting verification.",
    );
  } catch (err) {
    console.error("Submit alumni error:", err);
    return sendError(
      res,
      500,
      "Failed to submit alumni details",
      "INTERNAL_ERROR",
    );
  }
};

// ─── ADMIN: Get All Alumni with Full Records ─────────────────────────────
export const getAllAlumniWithRecords = async (req, res) => {
  try {
    const { page = 1, limit = 20, graduationYear, course } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (graduationYear) where.graduationYear = Number(graduationYear);
    if (course) where.course = { contains: course, mode: "insensitive" };

    const [total, alumni] = await prisma.$transaction([
      prisma.alumniProfile.count({ where }),
      prisma.alumniProfile.findMany({
        where,
        skip,
        take,
        orderBy: { graduationYear: "desc" },
        include: {
          updateRequests: {
            where: { status: "VERIFIED" },
            orderBy: { submittedAt: "desc" },
            take: 15,
          },
        },
      }),
    ]);

    return sendSuccess(
      res,
      200,
      alumni,
      "All alumni records fetched successfully",
      {
        total,
        pages: Math.ceil(total / take),
        currentPage: Number(page),
        perPage: take,
        hasNext: skip + take < total,
        hasPrev: Number(page) > 1,
      },
    );
  } catch (err) {
    console.error("Get all alumni records error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch all alumni records",
      "INTERNAL_ERROR",
    );
  }
};

// ─── ALUMNI: Get My Full Records (Profile + All Updates + History) ────────
export const getMyFullRecords = async (req, res) => {
  try {
    const alumniId = req.user.alumniId || req.user.id;

    const profile = await prisma.alumniProfile.findUnique({
      where: { id: alumniId },
      include: {
        updateRequests: {
          orderBy: { submittedAt: "desc" },
          take: 20, // Last 20 update requests
        },
      },
    });

    if (!profile) return sendError(res, 404, "Profile not found", "NOT_FOUND");

    return sendSuccess(
      res,
      200,
      profile,
      "Your full alumni records fetched successfully",
    );
  } catch (err) {
    console.error("Get my full records error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch full records",
      "INTERNAL_ERROR",
    );
  }
};

// ─── ALUMNI: Submit Update Request ───────────────────────────────────────
export const submitAlumniUpdate = async (req, res) => {
  try {
    const alumniId = req.user.alumniId;

    const existing = await prisma.alumniProfile.findUnique({
      where: { id: alumniId },
    });

    if (!existing) return sendError(res, 404, "Profile not found");

    const parsed = alumniUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        parsed.error.issues.map((e) => e.message).join(", "),
      );
    }

    const submission = await prisma.alumniSubmission.create({
      data: {
        name: parsed.data.name || existing.name,
        email: existing.email,
        phone: parsed.data.phone || existing.phone,
        dateOfBirth: existing.dateOfBirth,
        graduationYear: existing.graduationYear,
        course: existing.course,
        currentStatus: parsed.data.currentStatus || existing.currentStatus,
        organization: parsed.data.organization || existing.organization,
        designation: parsed.data.designation || existing.designation,
        location: parsed.data.location || existing.location,

        educationHistory: req.body.educationHistory || null,
        employmentHistory: req.body.employmentHistory || null,

        type: "UPDATE",
        alumniProfileId: existing.id,
        status: "PENDING",
      },
    });

    return sendSuccess(
      res,
      201,
      submission,
      "Update request submitted. Awaiting admin approval.",
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to submit update request");
  }
};

// ─── ADMIN: Approve Update (Merge + Strong Deduplication) ───────────────────
export const approveAlumniUpdate = async (req, res) => {
  try {
    const submission = await prisma.alumniSubmission.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!submission) return sendError(res, 404, "Submission not found");
    if (submission.status !== "PENDING") {
      return sendError(
        res,
        400,
        "Submission already processed",
        "INVALID_STATE",
      );
    }

    const profile = await prisma.alumniProfile.findUnique({
      where: { email: submission.email },
    });

    if (!profile) return sendError(res, 404, "Profile not found");

    const updateData = {};

    // Basic fields
    if (submission.name) updateData.name = submission.name;
    if (submission.phone) updateData.phone = submission.phone;
    if (submission.currentStatus)
      updateData.currentStatus = submission.currentStatus;
    if (submission.organization)
      updateData.organization = submission.organization;
    if (submission.designation) updateData.designation = submission.designation;
    if (submission.location) updateData.location = submission.location;

    // === STRONG DEDUPLICATION FOR EDUCATION ===
    if (
      submission.educationHistory &&
      Array.isArray(submission.educationHistory)
    ) {
      const existing = profile.educationHistory || [];
      const incoming = submission.educationHistory;

      const eduMap = new Map();

      // Add all existing + new entries, using strong unique key
      [...existing, ...incoming].forEach((item) => {
        if (item && item.level && item.year) {
          const key = `${item.level.toLowerCase().trim()}-${item.year}-${(item.school || item.university || "").toLowerCase().trim()}`;
          eduMap.set(key, item);
        }
      });

      updateData.educationHistory = Array.from(eduMap.values());
    }

    // === STRONG DEDUPLICATION FOR EMPLOYMENT ===
    if (
      submission.employmentHistory &&
      Array.isArray(submission.employmentHistory)
    ) {
      const existing = profile.employmentHistory || [];
      const incoming = submission.employmentHistory;

      const empMap = new Map();

      [...existing, ...incoming].forEach((item) => {
        if (item && item.company && item.fromYear) {
          const key = `${item.company.toLowerCase().trim()}-${item.fromYear}`;
          empMap.set(key, item);
        }
      });

      updateData.employmentHistory = Array.from(empMap.values());
    }

    const updatedProfile = await prisma.alumniProfile.update({
      where: { id: profile.id },
      data: updateData,
    });

    // Mark submission as VERIFIED
    await prisma.alumniSubmission.update({
      where: { id: submission.id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verifiedById: req.user.id,
      },
    });

    return sendSuccess(
      res,
      200,
      updatedProfile,
      "Profile updated with deduplicated history",
    );
  } catch (err) {
    console.error("Approve update error:", err);
    return sendError(res, 500, "Failed to approve update", "INTERNAL_ERROR");
  }
};

// ─── PUBLIC: Get verified alumni directory ──────────────────────
export const getAlumniDirectory = async (req, res) => {
  const { page = 1, limit = 20, graduationYear, course } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (graduationYear) where.graduationYear = Number(graduationYear);
    if (course) where.course = { contains: course, mode: "insensitive" };

    const [total, alumni] = await prisma.$transaction([
      prisma.alumniProfile.count({ where }),
      prisma.alumniProfile.findMany({
        where,
        skip,
        take,
        orderBy: { graduationYear: "desc" },
      }),
    ]);

    return sendSuccess(res, 200, alumni, "Alumni directory fetched", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error("Get alumni directory error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch alumni directory",
      "INTERNAL_ERROR",
    );
  }
};

// ─── ADMIN: Verify submission → move to AlumniProfile ───────────
export const verifySubmission = async (req, res) => {
  try {
    const submission = await prisma.alumniSubmission.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!submission) return sendError(res, 404, "Submission not found");
    if (submission.status !== "PENDING") {
      return sendError(
        res,
        400,
        "Submission already processed",
        "INVALID_STATE",
      );
    }

    // Create the permanent alumni profile with history
    const profile = await prisma.alumniProfile.create({
      data: {
        name: submission.name,
        email: submission.email,
        phone: submission.phone,
        dateOfBirth: submission.dateOfBirth,
        graduationYear: submission.graduationYear,
        course: submission.course,
        currentStatus: submission.currentStatus,
        organization: submission.organization,
        designation: submission.designation,
        location: submission.location,

        educationHistory: submission.educationHistory || [],
        employmentHistory: submission.employmentHistory || [],
      },
    });

    // Update submission status
    await prisma.alumniSubmission.update({
      where: { id: submission.id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verifiedById: req.user.id,
      },
    });

    return sendSuccess(
      res,
      200,
      profile,
      "Alumni verified and added to directory with full history",
    );
  } catch (err) {
    console.error("Verify submission error:", err);
    return sendError(res, 500, "Failed to verify submission", "INTERNAL_ERROR");
  }
};

// ─── PUBLIC: Get single alumni profile by ID ────────────────────
export const getAlumniProfile = async (req, res) => {
  try {
    const profile = await prisma.alumniProfile.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!profile) return sendError(res, 404, "Alumni profile not found");

    return sendSuccess(res, 200, profile, "Alumni profile fetched");
  } catch (err) {
    console.error("Get alumni profile error:", err);
    return sendError(res, 500, "Failed to fetch profile", "INTERNAL_ERROR");
  }
};

// ─── ADMIN: List pending submissions ────────────────────────────
export const getPendingSubmissions = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, submissions] = await prisma.$transaction([
      prisma.alumniSubmission.count({ where: { status: "PENDING" } }),
      prisma.alumniSubmission.findMany({
        where: { status: "PENDING" },
        skip,
        take,
        orderBy: { submittedAt: "asc" },
      }),
    ]);

    return sendSuccess(res, 200, submissions, "Pending submissions fetched", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error("Get pending submissions error:", err);
    return sendError(res, 500, "Failed to fetch submissions", "INTERNAL_ERROR");
  }
};

// ─── ADMIN: Get single submission details ───────────────────────
export const getSubmissionDetails = async (req, res) => {
  try {
    const submission = await prisma.alumniSubmission.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!submission) return sendError(res, 404, "Submission not found");

    return sendSuccess(res, 200, submission, "Submission details");
  } catch (err) {
    console.error("Get submission details error:", err);
    return sendError(res, 500, "Failed to fetch submission", "INTERNAL_ERROR");
  }
};

// ─── ADMIN: Reject submission ───────────────────────────────────
export const rejectSubmission = async (req, res) => {
  try {
    const submission = await prisma.alumniSubmission.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!submission) return sendError(res, 404, "Submission not found");
    if (submission.status !== "PENDING") {
      return sendError(
        res,
        400,
        "Submission already processed",
        "INVALID_STATE",
      );
    }

    await prisma.alumniSubmission.update({
      where: { id: submission.id },
      data: {
        status: "REJECTED",
        verifiedAt: new Date(),
        verifiedById: req.user.id,
      },
    });

    return sendSuccess(res, 200, null, "Submission rejected");
  } catch (err) {
    console.error("Reject submission error:", err);
    return sendError(res, 500, "Failed to reject submission", "INTERNAL_ERROR");
  }
};

// ─── ADMIN: Delete submission (any status) ──────────────────────
export const deleteSubmission = async (req, res) => {
  try {
    const submission = await prisma.alumniSubmission.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!submission) return sendError(res, 404, "Submission not found");

    await prisma.alumniSubmission.delete({
      where: { id: submission.id },
    });

    return sendSuccess(res, 200, null, "Submission deleted");
  } catch (err) {
    console.error("Delete submission error:", err);
    return sendError(res, 500, "Failed to delete submission", "INTERNAL_ERROR");
  }
};

export const getMyUpdateRequests = async (req, res) => {
  try {
    const requests = await prisma.alumniSubmission.findMany({
      where: { alumniProfileId: req.user.id, type: "UPDATE" },
      orderBy: { submittedAt: "desc" },
    });
    return sendSuccess(res, 200, requests);
  } catch (err) {
    return sendError(res, 500, "Failed to fetch update requests");
  }
};
