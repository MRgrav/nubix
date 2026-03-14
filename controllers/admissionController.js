import prisma from "../models/prisma.js";
import { createStudentService } from "../services/studentService.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";
import z from "zod";

// ────────────────────────────────────────────────
// Zod Schemas (complete & strict)
// ────────────────────────────────────────────────
const addressSchema = z.object({
  houseNo: z.string().optional(),
  addressLine1: z.string().min(1, "Address line 1 required"),
  addressLine2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().min(1, "City required"),
  district: z.string().optional(),
  state: z.string().min(1, "State required"),
  pinCode: z.string().regex(/^\d{6}$/, "PIN code must be exactly 6 digits"),
  postOffice: z.string().optional(),
  country: z.string().default("India"),
  addressType: z
    .enum(["CURRENT", "PERMANENT", "CORRESPONDENCE", "OTHER"])
    .default("CURRENT"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const admissionDocumentSchema = z.object({
  documentType: z.enum([
    "ADMISSION_FORM",
    "PHOTO",
    "MARKSHEET_PREV_CLASS",
    "TRANSFER_CERTIFICATE",
    "AADHAAR_CARD",
    "BIRTH_CERTIFICATE",
    "RECEIPT_ADMISSION_FEE",
    "OTHER_CERTIFICATE",
    "OTHER_DOCUMENT",
  ]),
  title: z.string().optional(),
  fileUrl: z.string().url("Invalid file URL"),
  fileName: z.string().min(1, "File name required"),
  mimeType: z.string().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
});

const admissionSchema = z
  .object({
    applicationNo: z.string().optional(),
    name: z.string().min(1, "Name required"),
    email: z.string().email("Invalid email"),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    dateOfBirth: z.string().optional(),
    aadhaarNumber: z
      .string()
      .length(12, "Aadhaar must be 12 digits")
      .optional(),
    permanentEducationNumber: z.string().optional(),

    currentAddress: addressSchema.optional(),
    permanentAddress: addressSchema.optional(),

    category: z.enum(["GENERAL", "SC", "ST", "OBC", "EWS", "OTHER"]).optional(),
    isStaffWard: z.boolean().optional().default(false),
    hasSiblingInSchool: z.boolean().optional().default(false),

    previousSchoolName: z.string().optional(),
    previousSchoolAddress: z.string().optional(),
    previousClass: z.string().optional(),
    previousGrade: z.string().optional(),
    totalSubjectsInPrevClass: z.number().int().optional(),
    totalMarksObtainedInPrevClass: z.number().optional(),
    fullMarksInPrevClass: z.number().optional(),

    admissionForClass: z.string().min(1, "Admission class required").optional(),
    requestedClassroomId: z.number().int().positive().optional(),
    requestedStreamId: z.number().int().positive().optional(),

    parents: z
      .array(
        z.object({
          type: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]),
          name: z.string().min(1, "Parent/guardian name required"),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          isPrimary: z.boolean().optional(),
        }),
      )
      .min(1, "At least one parent/guardian required")
      .optional(),

    electiveSubjects: z.array(z.number().int().positive()).optional(),

    totalAdmissionAmount: z.number().optional(),
    monthlyFees: z.number().optional(),
    admissionReceiptNo: z.string().optional(),
    admissionReceiptLink: z.string().url().optional(),

    documents: z
      .array(admissionDocumentSchema)
      .max(10, "Maximum 10 documents allowed")
      .optional()
      .default([]),

    schoolId: z.number().int().positive("School ID required"),

    isReAdmission: z.boolean().optional().default(false),
  })
  .refine((data) => data.currentAddress || data.permanentAddress, {
    message: "At least one address (current or permanent) is required",
    path: ["addresses"],
  });

// 1. Submit admission form (public/student)
export const createAdmission = async (req, res) => {
  try {
    const data = admissionSchema.parse(req.body);

    // let academicYearId = data.academicYearId || null;

    // if (academicYearId) {
    //   const year = await prisma.academicYear.findUnique({
    //     where: { id: academicYearId },
    //     select: { id: true },
    //   });
    //   if (!year) {
    //     return sendError(
    //       res,
    //       400,
    //       "Invalid academic year ID provided",
    //       "INVALID_REFERENCE",
    //     );
    //   }
    // }

    // Prevent duplicate application by email (no year dependency)
    const existing = await prisma.admissionRequest.findFirst({
      where: {
        email: data.email,
        schoolId: data.schoolId,
        isArchived: false,
        status: {
          in: ["PENDING", "UNDER_REVIEW", "SHORTLISTED", "WAITLISTED"],
        },
      },
    });
    if (existing) {
      return sendError(
        res,
        409,
        "An admission request already exists for this email",
        "DUPLICATE_APPLICATION",
      );
    }

    // Create addresses
    let currentAddressId = null;
    let permanentAddressId = null;

    if (data.currentAddress) {
      const addr = await prisma.address.create({
        data: { ...data.currentAddress, addressType: "CURRENT" },
      });
      currentAddressId = addr.id;
    }

    if (data.permanentAddress) {
      const addr = await prisma.address.create({
        data: { ...data.permanentAddress, addressType: "PERMANENT" },
      });
      permanentAddressId = addr.id;
    }

    // Create admission request
    const admission = await prisma.admissionRequest.create({
      data: {
        applicationNo: data.applicationNo || null,
        name: data.name,
        email: data.email,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        aadhaarNumber: data.aadhaarNumber,
        permanentEducationNumber: data.permanentEducationNumber,
        currentAddressId,
        permanentAddressId,
        category: data.category,
        isStaffWard: data.isStaffWard,
        hasSiblingInSchool: data.hasSiblingInSchool,
        previousSchoolName: data.previousSchoolName,
        previousSchoolAddress: data.previousSchoolAddress,
        previousClass: data.previousClass,
        previousGrade: data.previousGrade,
        totalSubjectsInPrevClass: data.totalSubjectsInPrevClass,
        totalMarksObtainedInPrevClass: data.totalMarksObtainedInPrevClass,
        fullMarksInPrevClass: data.fullMarksInPrevClass,
        admissionForClass: data.admissionForClass,
        requestedClassroomId: data.requestedClassroomId,
        requestedStreamId: data.requestedStreamId,
        parents: data.parents || null,
        electiveSubjects: data.electiveSubjects || null,
        totalAdmissionAmount: data.totalAdmissionAmount,
        monthlyFees: data.monthlyFees,
        admissionReceiptNo: data.admissionReceiptNo,
        admissionReceiptLink: data.admissionReceiptLink,
        schoolId: data.schoolId,
        createdById: req.user?.id || null,
        isReAdmission: data.isReAdmission,
      },
      include: {
        currentAddress: true,
        permanentAddress: true,
        school: { select: { name: true } },
      },
    });

    // Handle documents
    if (data.documents?.length > 0) {
      await prisma.admissionDocument.createMany({
        data: data.documents.map((doc) => ({
          ...doc,
          admissionRequestId: admission.id,
          uploadedById: req.user?.id || null,
        })),
      });
    }

    return sendSuccess(
      res,
      201,
      admission,
      "Admission request submitted successfully",
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
        "VALIDATION_ERROR",
      );
    }
    console.error("Admission creation failed:", err);
    return sendError(
      res,
      500,
      "Failed to submit admission request",
      err.message || "Internal error",
    );
  }
};

// 2. Admin: List admissions (with advanced filters)
export const getAdmissions = async (req, res) => {
  const {
    status,
    page = 1,
    limit = 20,
    search,
    classroomId,
    category,
    isReAdmission,
    isArchived = false,
  } = req.query;

  try {
    const where = {
      schoolId: req.user.schoolId,
      isArchived: isArchived === "true",
    };

    if (status && status !== "ALL") where.status = status.toUpperCase();
    if (classroomId) where.requestedClassroomId = Number(classroomId);
    if (category) where.category = category.toUpperCase();
    if (isReAdmission !== undefined)
      where.isReAdmission = isReAdmission === "true";

    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
        { applicationNo: { contains: search.trim(), mode: "insensitive" } },
        { aadhaarNumber: { contains: search.trim(), mode: "insensitive" } },
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
        orderBy: { appliedAt: "desc" },
        include: {
          school: { select: { name: true } },
          // Removed academicYear include (use sessionYear instead)
          currentAddress: true,
          permanentAddress: true,
          documents: true,
          requestedClassroom: { select: { name: true, section: true } },
          requestedStream: { select: { name: true } },
          createdBy: { select: { email: true, role: true } },
          approvedBy: { select: { email: true, role: true } },
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
    console.error("Get admissions error:", err);
    return sendError(res, 500, "Failed to fetch admissions", err.message);
  }
};

// 3. Admin / User: Get single admission
export const getAdmission = async (req, res) => {
  try {
    const admission = await prisma.admissionRequest.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        school: { select: { name: true } },
        currentAddress: true,
        permanentAddress: true,
        documents: true,
        requestedClassroom: { select: { name: true, section: true } },
        requestedStream: { select: { name: true } },
        createdBy: { select: { email: true, role: true } },
        approvedBy: { select: { email: true, role: true } },
        student: { select: { id: true, name: true } },
      },
    });

    if (!admission) return sendError(res, 404, "Admission request not found");

    // Optional: Restrict non-admin access
    if (req.user.role !== "ADMIN" && req.user.role !== "STAFF") {
      if (
        admission.createdById !== req.user.id &&
        admission.student?.userId !== req.user.id
      ) {
        return sendError(res, 403, "Not authorized to view this admission");
      }
    }

    return sendSuccess(res, 200, admission, "Admission details fetched");
  } catch (err) {
    console.error("Get admission error:", err);
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

    if (!["PENDING", "UNDER_REVIEW"].includes(admission.status)) {
      return sendError(
        res,
        400,
        "Cannot update processed admission",
        "INVALID_OPERATION",
      );
    }

    // Prepare update data
    const data = {
      name: updates.name,
      email: updates.email,
      gender: updates.gender,
      dateOfBirth: updates.dateOfBirth
        ? new Date(updates.dateOfBirth)
        : undefined,
      aadhaarNumber: updates.aadhaarNumber,
      permanentEducationNumber: updates.permanentEducationNumber,
      category: updates.category,
      isStaffWard: updates.isStaffWard,
      hasSiblingInSchool: updates.hasSiblingInSchool,
      previousSchoolName: updates.previousSchoolName,
      previousSchoolAddress: updates.previousSchoolAddress,
      previousClass: updates.previousClass,
      previousGrade: updates.previousGrade,
      totalSubjectsInPrevClass: updates.totalSubjectsInPrevClass,
      totalMarksObtainedInPrevClass: updates.totalMarksObtainedInPrevClass,
      fullMarksInPrevClass: updates.fullMarksInPrevClass,
      admissionForClass: updates.admissionForClass,
      requestedClassroomId: updates.requestedClassroomId,
      requestedStreamId: updates.requestedStreamId,
      parents: updates.parents ?? undefined,
      electiveSubjects: updates.electiveSubjects ?? undefined,
      totalAdmissionAmount: updates.totalAdmissionAmount,
      monthlyFees: updates.monthlyFees,
      admissionReceiptNo: updates.admissionReceiptNo,
      admissionReceiptLink: updates.admissionReceiptLink,
      notes: updates.notes,
      isReAdmission: updates.isReAdmission,
    };

    // Handle address updates
    if (updates.currentAddress) {
      if (admission.currentAddressId) {
        await prisma.address.update({
          where: { id: admission.currentAddressId },
          data: updates.currentAddress,
        });
      } else {
        const addr = await prisma.address.create({
          data: { ...updates.currentAddress, addressType: "CURRENT" },
        });
        data.currentAddressId = addr.id;
      }
    }

    if (updates.permanentAddress) {
      if (admission.permanentAddressId) {
        await prisma.address.update({
          where: { id: admission.permanentAddressId },
          data: updates.permanentAddress,
        });
      } else {
        const addr = await prisma.address.create({
          data: { ...updates.permanentAddress, addressType: "PERMANENT" },
        });
        data.permanentAddressId = addr.id;
      }
    }

    // Handle new documents
    if (updates.documents?.length > 0) {
      await prisma.admissionDocument.createMany({
        data: updates.documents.map((doc) => ({
          ...doc,
          admissionRequestId: Number(id),
          uploadedById: req.user.id,
        })),
      });
    }

    const updated = await prisma.admissionRequest.update({
      where: { id: Number(id) },
      data,
      include: {
        currentAddress: true,
        permanentAddress: true,
        documents: true,
        requestedClassroom: { select: { name: true, section: true } },
        requestedStream: { select: { name: true } },
      },
    });

    return sendSuccess(res, 200, updated, "Admission updated successfully");
  } catch (err) {
    console.error("Update admission error:", err);
    return sendError(res, 500, "Failed to update admission", err.message);
  }
};

// 5. Admin: Approve admission → create/update student
export const approveAdmission = async (req, res) => {
  const { id } = req.params;
  const { classroomId, streamId, academicYearId, rollNo } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const admission = await tx.admissionRequest.findUnique({
        where: { id: Number(id) },
        include: {
          currentAddress: true,
          permanentAddress: true,
          documents: true,
        },
      });

      if (!admission) throw new Error("NOT_FOUND");
      if (!["PENDING", "UNDER_REVIEW"].includes(admission.status)) {
        throw new Error("ALREADY_PROCESSED");
      }

      let student;

      if (admission.isReAdmission && admission.studentId) {
        student = await tx.student.update({
          where: { id: admission.studentId },
          data: {
            classroomId: classroomId || admission.requestedClassroomId,
            streamId: streamId || admission.requestedStreamId,
            academicYearId: academicYearId || admission.academicYearId,
            rollNo: rollNo || null,
          },
        });
      } else {
        // Create student WITHOUT classroom/stream first
        const studentData = {
          name: admission.name,
          email: admission.email,
          gender: admission.gender,
          dateOfBirth: admission.dateOfBirth,
          aadhaarNumber: admission.aadhaarNumber,
          permanentEducationNumber: admission.permanentEducationNumber,
          schoolId: admission.schoolId,
          rollNo: rollNo || null,
          currentAddress: admission.currentAddress
            ? { create: { ...admission.currentAddress, id: undefined } }
            : undefined,
          permanentAddress: admission.permanentAddress
            ? { create: { ...admission.permanentAddress, id: undefined } }
            : undefined,
          parents: admission.parents || [],
        };

        const created = await createStudentService(
          tx,
          studentData,
          req.user.id,
        );
        student = created.student;

        // NOW enroll (create studentStream)
        const ayId = academicYearId || admission.academicYearId;
        if (!ayId) throw new Error("No academic year provided");

        const finalClassroomId = classroomId || admission.requestedClassroomId;
        const finalStreamId = streamId || admission.requestedStreamId;

        if (!finalClassroomId) {
          throw new Error("Classroom ID required for new student enrollment");
        }

        // Check for duplicate enrollment
        const existingEnroll = await tx.studentStream.findUnique({
          where: {
            academicYearId_studentId: {
              academicYearId: ayId,
              studentId: student.id,
            },
          },
        });

        if (existingEnroll) {
          throw new Error("Student already enrolled in this academic year");
        }

        await tx.studentStream.create({
          data: {
            studentId: student.id,
            academicYearId: ayId,
            classroomId: Number(finalClassroomId),
            streamId: finalStreamId ? Number(finalStreamId) : null,
            rollNo: rollNo || null,
          },
        });

        // Update student's direct classroom reference
        await tx.student.update({
          where: { id: student.id },
          data: { classroomId: Number(finalClassroomId) },
        });
      }

      // Update admission
      const updatedAdmission = await tx.admissionRequest.update({
        where: { id: Number(id) },
        data: {
          status: "APPROVED",
          approvedById: req.user.id,
          studentId: student.id,
          approvedAt: new Date(),
        },
      });

      return { student, admission: updatedAdmission };
    });

    return sendSuccess(
      res,
      200,
      result,
      "Admission approved & student enrolled",
    );
  } catch (err) {
    console.error("Approve admission error:", err);

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Student is already enrolled in this academic year",
        "ENROLLMENT_CONFLICT",
      );
    }

    if (err.message === "NOT_FOUND")
      return sendError(res, 404, "Admission not found");
    if (err.message === "ALREADY_PROCESSED")
      return sendError(res, 400, "Admission already processed");

    return sendError(
      res,
      500,
      "Failed to approve admission",
      err.message || "Internal error",
    );
  }
};

// 6. Admin: Reject admission
export const rejectAdmission = async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;

  try {
    const admission = await prisma.admissionRequest.findUnique({
      where: { id: Number(id) },
    });

    if (!admission) return sendError(res, 404, "Admission not found");

    if (!["PENDING", "UNDER_REVIEW"].includes(admission.status)) {
      return sendError(
        res,
        400,
        "Only pending/under-review admissions can be rejected",
        "INVALID_OPERATION",
      );
    }

    const updated = await prisma.admissionRequest.update({
      where: { id: Number(id) },
      data: {
        status: "REJECTED",
        rejectionReason: rejectionReason || "Rejected by admin",
        approvedById: req.user.id,
        rejectedAt: new Date(),
      },
    });

    return sendSuccess(res, 200, updated, "Admission rejected successfully");
  } catch (err) {
    console.error("Reject admission error:", err);
    return sendError(res, 500, "Failed to reject admission");
  }
};

// 7. Admin: Archive old admissions (year-end cleanup)
export const archiveAdmissions = async (req, res) => {
  const { academicYearId } = req.body;

  try {
    if (!academicYearId) return sendError(res, 400, "academicYearId required");

    const archived = await prisma.admissionRequest.updateMany({
      where: {
        academicYearId: Number(academicYearId),
        status: { in: ["APPROVED", "REJECTED"] },
        isArchived: false,
      },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });

    return sendSuccess(
      res,
      200,
      { archivedCount: archived.count },
      "Admissions archived successfully",
    );
  } catch (err) {
    console.error("Archive admissions error:", err);
    return sendError(res, 500, "Failed to archive admissions");
  }
};
