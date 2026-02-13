// controllers/admissionController.js
import prisma from "../models/prisma.js";
import { createStudentService } from "../services/studentService.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";
import z from "zod";

const admissionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.string().optional(),
  academicYearId: z.number().int().positive().optional(),
  previousSchoolName: z.string().optional(),
  previousClass: z.string().optional(),
  previousGrade: z.string().optional(),
  promotedToClass: z.string().optional(),
  totalAdmissionAmount: z.number().optional(),
  monthlyFees: z.number().optional(),
  admissionDate: z.string().optional(),
  admissionReceiptNo: z.string().optional(),
  admissionReceiptLink: z.string().url().optional(),
  requestedClassroomId: z.number().int().positive().optional(),
  requestedStreamId: z.number().int().positive().optional(),
  parents: z
    .array(
      z.object({
        type: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]),
        name: z.string().min(1, "Parent name required"),
        email: z.string().email("Invalid parent email"),
        phone: z.string().optional(),
        address: z.string().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
  schoolId: z.number().int().positive("School ID required"),
});

// 1. Public: Submit admission form
export const createAdmission = async (req, res) => {
  try {
    const validated = admissionSchema.parse(req.body);

    // const activeYear = await getActiveAcademicYear(validated.schoolId);
    // if (!activeYear) {
    //   return sendError(
    //     res,
    //     400,
    //     "No active academic year for this school",
    //     "ACADEMIC_YEAR_ERROR",
    //   );
    // }

    // let academicYearId = validated.academicYearId;

    // if (!academicYearId) {
    //   const activeYear = await getActiveAcademicYear(validated.schoolId);
    //   academicYearId = activeYear?.id || null; // fallback only
    // }

    const admission = await prisma.admissionRequest.create({
      data: {
        ...validated,
        dateOfBirth: validated.dateOfBirth
          ? new Date(validated.dateOfBirth)
          : null,
        admissionDate: validated.admissionDate
          ? new Date(validated.admissionDate)
          : null,
        parents: validated.parents ? JSON.stringify(validated.parents) : null,
        schoolId: validated.schoolId,
        academicYearId: validated.academicYearId || null,
        createdById: req.user?.id || null,
      },
      include: {
        school: { select: { id: true, name: true } },
        academicYear: { select: { label: true } },
      },
    });

    return sendSuccess(
      res,
      201,
      admission,
      "Admission request submitted successfully. Admin will review soon.",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    console.error("Create admission error:", err);
    return sendError(
      res,
      500,
      "Failed to submit admission request",
      "INTERNAL_ERROR",
    );
  }
};

// 2. Admin: List all admission requests
export const getAdmissions = async (req, res) => {
  const { status = "PENDING", page = 1, limit = 20, search } = req.query;

  try {
    const where = {
      schoolId: req.user.schoolId,
      status: status.toUpperCase(),
    };

    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, admissions] = await prisma.$transaction([
      prisma.admissionRequest.count({ where }),
      prisma.admissionRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          school: { select: { name: true } },
          academicYear: { select: { label: true } },
          createdBy: { select: { email: true, role: true } },
          student: { select: { id: true, name: true } }, // if approved
        },
      }),
    ]);

    return sendSuccess(res, 200, admissions, "Admission requests fetched", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error("Get admissions error:", err);
    return sendError(res, 500, "Failed to fetch admissions", "INTERNAL_ERROR");
  }
};

// 3. Admin: Get single admission request
export const getAdmission = async (req, res) => {
  const { id } = req.params;

  try {
    const admission = await prisma.admissionRequest.findUnique({
      where: { id: Number(id) },
      include: {
        school: { select: { name: true } },
        academicYear: { select: { label: true } },
        createdBy: { select: { email: true, role: true } },
        student: { select: { id: true, name: true } },
      },
    });

    if (!admission) {
      return sendError(res, 404, "Admission request not found", "NOT_FOUND");
    }

    return sendSuccess(
      res,
      200,
      admission,
      "Admission request details fetched",
    );
  } catch (err) {
    return sendError(
      res,
      500,
      "Failed to fetch admission request",
      "INTERNAL_ERROR",
    );
  }
};

// 4. Admin: Update admission request (before approval)
export const updateAdmission = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const admission = await prisma.admissionRequest.findUnique({
      where: { id: Number(id) },
    });

    if (!admission) return sendError(res, 404, "Admission not found");
    if (admission.status !== "PENDING") {
      return sendError(
        res,
        400,
        "Cannot update non-pending admission",
        "INVALID_OPERATION",
      );
    }

    const updated = await prisma.admissionRequest.update({
      where: { id: Number(id) },
      data: {
        ...updates,
        // Handle dates if sent as string
        ...(updates.dateOfBirth && {
          dateOfBirth: new Date(updates.dateOfBirth),
        }),
        ...(updates.admissionDate && {
          admissionDate: new Date(updates.admissionDate),
        }),
        parents: updates.parents ? JSON.stringify(updates.parents) : undefined,
      },
      include: {
        school: { select: { name: true } },
        academicYear: { select: { label: true } },
      },
    });

    return sendSuccess(
      res,
      200,
      updated,
      "Admission request updated successfully",
    );
  } catch (err) {
    console.error("Update admission error:", err);
    return sendError(res, 500, "Failed to update admission", "INTERNAL_ERROR");
  }
};

// 5. Admin: Approve admission → create real student
export const approveAdmission = async (req, res) => {
  const { id } = req.params;
  const { classroomId, streamId, academicYearId } = req.body;

  try {
    const admission = await prisma.admissionRequest.findUnique({
      where: { id: Number(id) },
    });

    if (!admission) return sendError(res, 404, "Admission request not found");
    if (admission.status !== "PENDING") {
      return sendError(
        res,
        400,
        "This admission is already processed",
        "INVALID_OPERATION",
      );
    }

    // Prepare data for student creation
    const studentData = {
      ...admission,
      classroomId: classroomId || admission.requestedClassroomId,
      streamId: streamId || admission.requestedStreamId,
      academicYearId: academicYearId || admission.academicYearId,
      parents: admission.parents ? JSON.parse(admission.parents) : [],
      schoolId: admission.schoolId,
    };

    // Create real student using service
    const created = await createStudentService(
      prisma,
      studentData,
      req.user.id,
    );

    // Mark admission as approved
    const updatedAdmission = await prisma.admissionRequest.update({
      where: { id: Number(id) },
      data: {
        status: "APPROVED",
        approvedById: req.user.id,
        studentId: created.student.id,
      },
      include: {
        student: { select: { id: true, name: true } },
      },
    });

    return sendSuccess(
      res,
      200,
      {
        student: created.student,
        enrollment: created.enrollment,
        temporaryPassword: created.tempPassword,
        createdParents: created.createdParents?.length
          ? created.createdParents
          : undefined,
        admission: updatedAdmission,
      },
      "Admission approved and student enrolled successfully. Share temporary passwords securely with the student/parents.",
    );
  } catch (err) {
    console.error("Approve admission error:", err);
    return sendError(res, 500, "Failed to approve admission", "INTERNAL_ERROR");
  }
};

// 6. Admin: Reject admission
export const rejectAdmission = async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const admission = await prisma.admissionRequest.findUnique({
      where: { id: Number(id) },
    });

    if (!admission) return sendError(res, 404, "Admission not found");
    if (admission.status !== "PENDING") {
      return sendError(
        res,
        400,
        "Cannot reject non-pending admission",
        "INVALID_OPERATION",
      );
    }

    const updated = await prisma.admissionRequest.update({
      where: { id: Number(id) },
      data: {
        status: "REJECTED",
        notes: notes || "Rejected by admin",
        approvedById: req.user.id,
      },
    });

    return sendSuccess(res, 200, updated, "Admission request rejected");
  } catch (err) {
    return sendError(res, 500, "Failed to reject admission", "INTERNAL_ERROR");
  }
};
