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

    const admission = await prisma.admissionRequest.create({
      data: {
        ...validated,
        dateOfBirth: validated.dateOfBirth
          ? new Date(validated.dateOfBirth)
          : null,
        admissionDate: validated.admissionDate
          ? new Date(validated.admissionDate)
          : null,
        parents: validated.parents || null, // ⭐ FIXED (no stringify)
        academicYearId: validated.academicYearId || null,
        createdById: req.user?.id || null,
      },
      include: {
        school: { select: { id: true, name: true } },
        academicYear: { select: { label: true } },
        requestedClassroom: { select: { id: true, name: true, section: true } },
        requestedStream: { select: { id: true, name: true } },
      },
    });

    return sendSuccess(res, 201, admission, "Admission request submitted");
  } catch (err) {
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    console.error(err);
    return sendError(res, 500, "Failed to submit admission");
  }
};

// 2. Admin: List all admission requests
export const getAdmissions = async (req, res) => {
  const { status, page = 1, limit = 20, search, classroomId } = req.query;

  try {
    const where = {
      schoolId: req.user.schoolId,
    };

    if (status && status !== "ALL") {
      where.status = status.toUpperCase();
    }

    if (classroomId) {
      where.requestedClassroomId = Number(classroomId); // ⭐ FIX
    }

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
          requestedClassroom: {
            select: {
              id: true,
              name: true,
              section: true,
            },
          },
          requestedStream: {
            select: {
              id: true,
              name: true,
            },
          },
          createdBy: { select: { email: true, role: true } },
          student: { select: { id: true, name: true } },
        },
      }),
    ]);

    return sendSuccess(res, 200, admissions, "Admissions fetched", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch admissions");
  }
};

// 3. Admin: Get single admission request
export const getAdmission = async (req, res) => {
  try {
    const admission = await prisma.admissionRequest.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        school: { select: { name: true } },
        academicYear: { select: { label: true } },
        requestedClassroom: { select: { id: true, name: true, section: true } },
        requestedStream: { select: { id: true, name: true } },
        createdBy: { select: { email: true, role: true } },
        student: { select: { id: true, name: true } },
      },
    });

    if (!admission) return sendError(res, 404, "Admission not found");

    return sendSuccess(res, 200, admission, "Admission details fetched");
  } catch (err) {
    return sendError(res, 500, "Failed to fetch admission");
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

    const data = {
      name: updates.name,
      email: updates.email,
      gender: updates.gender,
      previousSchoolName: updates.previousSchoolName,
      previousClass: updates.previousClass,
      previousGrade: updates.previousGrade,
      promotedToClass: updates.promotedToClass,
      requestedClassroomId: updates.requestedClassroomId,
      requestedStreamId: updates.requestedStreamId,
      academicYearId: updates.academicYearId,
      notes: updates.notes,
      parents: updates.parents ?? undefined,

      ...(updates.dateOfBirth && {
        dateOfBirth: new Date(updates.dateOfBirth),
      }),
      ...(updates.admissionDate && {
        admissionDate: new Date(updates.admissionDate),
      }),
    };

    const updated = await prisma.admissionRequest.update({
      where: { id: Number(id) },
      data,
      include: {
        requestedClassroom: { select: { name: true, section: true } },
        requestedStream: { select: { name: true } },
      },
    });

    return sendSuccess(res, 200, updated, "Admission updated");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to update admission");
  }
};

// 5. Admin: Approve admission → create real student
export const approveAdmission = async (req, res) => {
  const { id } = req.params;
  const { classroomId, streamId, academicYearId } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const admission = await tx.admissionRequest.findUnique({
        where: { id: Number(id) },
      });

      if (!admission) throw new Error("NOT_FOUND");
      if (admission.status !== "PENDING") throw new Error("ALREADY_PROCESSED");

      const studentData = {
        ...admission,
        classroomId: classroomId || admission.requestedClassroomId,
        streamId: streamId || admission.requestedStreamId,
        academicYearId: academicYearId || admission.academicYearId,
        parents: admission.parents || [],
        schoolId: admission.schoolId,
      };

      const created = await createStudentService(tx, studentData, req.user.id);

      const updatedAdmission = await tx.admissionRequest.update({
        where: { id: Number(id) },
        data: {
          status: "APPROVED",
          approvedById: req.user.id,
          studentId: created.student.id,
        },
      });

      return { created, updatedAdmission };
    });

    return sendSuccess(
      res,
      200,
      result,
      "Admission approved & student enrolled",
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to approve admission");
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
        "Only pending admissions can be rejected",
        "INVALID_OPERATION",
      );
    }

    const updated = await prisma.admissionRequest.update({
      where: { id: Number(id) },
      data: {
        status: "REJECTED",
        notes: notes || "Rejected by admin",
        approvedById: req.user.id,
        updatedAt: new Date(),
      },
    });

    return sendSuccess(res, 200, updated, "Admission rejected");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to reject admission");
  }
};
