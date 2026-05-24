// controllers\alumniController.js
import prisma from "../models/prisma.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";
import { z } from "zod";
import jwt from "jsonwebtoken";

const alumniSubmissionSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"), // accept ISO string
  graduationYear: z.coerce.number().int().min(1900).max(2100),
  course: z.string().min(1),
  currentStatus: z.string().min(1),
  organization: z.string().optional(),
  designation: z.string().optional(),
  location: z.string().optional(),
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
      return sendError(
        res,
        400,
        "Identifier (email/phone) and date of birth are required",
      );
    }

    const alumni = await prisma.alumniProfile.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });

    if (!alumni) return sendError(res, 401, "Invalid credentials");

    const providedDate = new Date(dateOfBirth);
    const storedDate = new Date(alumni.dateOfBirth);
    if (providedDate.toDateString() !== storedDate.toDateString()) {
      return sendError(res, 401, "Invalid credentials");
    }

    const token = jwt.sign(
      { id: alumni.id, role: "ALUMNI", email: alumni.email },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    return sendSuccess(res, 200, { token, alumni }, "Login successful");
  } catch (err) {
    console.error("Alumni login error:", err);
    return sendError(res, 500, "Login failed", "INTERNAL_ERROR");
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

    const submission = await prisma.alumniSubmission.create({
      data: {
        ...parsed.data,
        dateOfBirth: new Date(parsed.data.dateOfBirth),
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

// ─── ALUMNI: Submit Update Request ───────────────────────────────────────
export const submitAlumniUpdate = async (req, res) => {
  try {
    const alumniId = req.user.id; // from JWT (after login)

    const existingProfile = await prisma.alumniProfile.findUnique({
      where: { id: alumniId },
    });
    if (!existingProfile) return sendError(res, 404, "Profile not found");

    const parsed = alumniUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      /* validation error */
    }

    // Prepare data: only fields that are provided, else keep existing
    const updateData = {
      name: parsed.data.name ?? existingProfile.name,
      phone: parsed.data.phone ?? existingProfile.phone,
      currentStatus: parsed.data.currentStatus ?? existingProfile.currentStatus,
      organization: parsed.data.organization ?? existingProfile.organization,
      designation: parsed.data.designation ?? existingProfile.designation,
      location: parsed.data.location ?? existingProfile.location,
      // these fields cannot be changed via update request (email, graduationYear, course, dateOfBirth)
      email: existingProfile.email,
      graduationYear: existingProfile.graduationYear,
      course: existingProfile.course,
      dateOfBirth: existingProfile.dateOfBirth,
    };

    const submission = await prisma.alumniSubmission.create({
      data: {
        ...updateData,
        type: "UPDATE",
        alumniProfileId: existingProfile.id,
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
    console.error("Submit alumni update error:", err);
    return sendError(res, 500, "Failed to submit update request");
  }
};

// ─── ADMIN: Approve Update (Merge into AlumniProfile) ───────────────────
export const approveAlumniUpdate = async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id);
    const submission = await prisma.alumniSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) return sendError(res, 404, "Submission not found");
    if (submission.status !== "PENDING") {
      return sendError(res, 400, "Submission already processed");
    }

    let updatedProfile;
    if (submission.type === "INITIAL") {
      // Create new profile
      updatedProfile = await prisma.alumniProfile.create({
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
        },
      });
    } else if (submission.type === "UPDATE") {
      // Update existing profile linked via alumniProfileId
      const profileId = submission.alumniProfileId;
      if (!profileId)
        return sendError(res, 400, "Missing alumni profile reference");

      const updateFields = {};
      if (submission.name) updateFields.name = submission.name;
      if (submission.phone) updateFields.phone = submission.phone;
      if (submission.currentStatus)
        updateFields.currentStatus = submission.currentStatus;
      if (submission.organization)
        updateFields.organization = submission.organization;
      if (submission.designation)
        updateFields.designation = submission.designation;
      if (submission.location) updateFields.location = submission.location;

      updatedProfile = await prisma.alumniProfile.update({
        where: { id: profileId },
        data: updateFields,
      });
    } else {
      return sendError(res, 400, "Invalid submission type");
    }

    // Mark submission as VERIFIED
    await prisma.alumniSubmission.update({
      where: { id: submissionId },
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
      "Submission approved successfully",
    );
  } catch (err) {
    console.error("Approve update error:", err);
    return sendError(res, 500, "Failed to approve submission");
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
    // Create the permanent alumni profile
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
      },
    });
    // Update submission status
    await prisma.alumniSubmission.update({
      where: { id: submission.id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verifiedById: req.user.id, // assuming req.user is populated by auth middleware
      },
    });
    return sendSuccess(
      res,
      200,
      profile,
      "Alumni verified and added to directory",
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

export const getMyAlumniProfile = async (req, res) => {
  try {
    const profile = await prisma.alumniProfile.findUnique({
      where: { id: req.user.id },
    });
    if (!profile) return sendError(res, 404, "Profile not found");
    return sendSuccess(res, 200, profile);
  } catch (err) {
    return sendError(res, 500, "Failed to fetch profile");
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
