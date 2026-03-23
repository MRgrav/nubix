// controllers\staffController.js
import prisma from "../models/prisma.js";
import bcrypt from "bcryptjs";
import { generateSecurePassword } from "./authController.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import z from "zod";
import { sendError, sendSuccess } from "../utils/responseStructure.js";
import addressSchema from "./../utils/validations/address.schems.js";
import { ensurePBAuth } from "../utils/pocketbase.js";
import pb from "../utils/pocketbase.js";

const staffDocumentMetadata = z.object({
  documentType: z.string().min(1, "Document type is required"),
  title: z.string().optional(),
});

const addressItemSchema = addressSchema.extend({
  addressType: z.enum(["CURRENT", "PERMANENT", "OTHER"]).default("CURRENT"),
});

// Zod schema
const createStaffSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  schoolId: z.coerce.number().int().positive("Invalid school ID"),
  employeeId: z.string().optional(),
  title: z.string().optional(),
  gender: z.string().optional(),
  employeeType: z.string().optional(),
  role: z.string().min(1).optional(),
  designation: z.string().optional(),
  dateOfBirth: z.string().optional(),
  dateOfJoining: z.string().optional(),

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

  isActive: z.coerce.boolean().optional().default(true),
  employeeStatus: z
    .enum(["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED", "SUSPENDED"])
    .optional()
    .default("ACTIVE"),

  addresses: z.array(addressItemSchema).optional().default([]),
  emergencyContact: z
    .object({
      name: z.string().min(2),
      relation: z.string().optional(),
      phone: z.string().min(10).optional(),
      email: z.string().email().optional(),
      isPrimary: z.boolean().optional().default(true),
    })
    .optional(),

  qualifications: z
    .array(
      z.object({
        id: z.number().int().optional(),
        degree: z.string().min(1),
        institution: z.string().optional(),
        yearOfPassing: z.number().int().optional(),
        grade: z.string().optional(),
      }),
    )
    .optional()
    .default([]),

  documents: z
    .array(
      z.object({
        id: z.number().int().optional(), // existing document ID
        documentType: z.string().min(1),
        title: z.string().optional(),
      }),
    )
    .optional(),
});

const updateStaffSchema = createStaffSchema.partial();

const sanitize = (v) =>
  typeof v === "string" ? v.trim() || null : (v ?? null);

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const buildStaffBase = (data) => ({
  employeeId: sanitize(data.employeeId),
  title: sanitize(data.title),
  name: sanitize(data.name),
  gender: sanitize(data.gender),
  employeeType: sanitize(data.employeeType),
  role: sanitize(data.role),
  designation: sanitize(data.designation),
  dateOfBirth: parseDate(data.dateOfBirth),
  dateOfJoining: parseDate(data.dateOfJoining),
  aadharNumber: sanitize(data.aadharNumber),
  panNumber: sanitize(data.panNumber),
  mobile: sanitize(data.mobile),
  alternateMobile: sanitize(data.alternateMobile),
  alternateEmail: sanitize(data.alternateEmail),
  brokerBranch: sanitize(data.brokerBranch),
  bankName: sanitize(data.bankName),
  bankBranchName: sanitize(data.bankBranchName),
  bankAccountNumber: sanitize(data.bankAccountNumber),
  ifscCode: sanitize(data.ifscCode),
  isActive: data.isActive ?? true,
  employeeStatus: data.employeeStatus ?? "ACTIVE",
});

const parseJSONFields = (body) => {
  const fields = [
    "addresses",
    "emergencyContact",
    "qualifications",
    "documents",
    "documentsMeta",
  ];
  for (const field of fields) {
    if (typeof body[field] === "string") {
      try {
        body[field] = JSON.parse(body[field]);
      } catch (e) {
        // Leave as string; Zod will catch the invalid format
      }
    }
  }
  return body;
};

export const createStaff = async (req, res) => {
  try {
    // 1. Convert stringified JSON fields before Zod validation
    parseJSONFields(req.body);
    const rawData = createStaffSchema.parse(req.body);

    // 2. No need to re-parse (Zod already validated the types)
    const {
      email,
      name,
      schoolId,
      documents = [],
      addresses = [],
      emergencyContact,
      qualifications = [],
    } = rawData;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    // 3. Prevent duplicate email
    const [existingUser, existingStaff] = await Promise.all([
      prisma.user.findUnique({ where: { email: normalizedEmail } }),
      prisma.staff.findUnique({ where: { email: normalizedEmail } }),
    ]);

    if (existingUser || existingStaff) {
      return sendError(res, 409, "Email already registered", "EMAIL_CONFLICT");
    }

    // 4. School ownership check
    if (req.user.schoolId && req.user.schoolId !== Number(schoolId)) {
      return sendError(
        res,
        403,
        "Cannot create staff for another school",
        "FORBIDDEN",
      );
    }

    // 5. File handling (must be present if documents metadata exist)
    const files = req.files || [];
    if (documents.length > files.length) {
      return sendError(
        res,
        400,
        "Missing files for some document metadata",
        "FILE_MISSING",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const tempPassword = generateSecurePassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
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
          ...buildStaffBase(rawData),
          name: normalizedName,
          email: normalizedEmail,
          school: { connect: { id: Number(schoolId) } },
          user: { connect: { id: user.id } },
          createdBy: req.user.id ? { connect: { id: req.user.id } } : undefined,
          ...(addresses.length > 0 && {
            addresses: {
              create: addresses.map((addr) => ({
                houseNo: addr.houseNo,
                addressLine1: addr.addressLine1,
                addressLine2: addr.addressLine2 ?? null,
                landmark: addr.landmark ?? null,
                city: addr.city,
                district: addr.district ?? null,
                state: addr.state,
                pinCode: addr.pinCode,
                postOffice: addr.postOffice ?? null,
                country: addr.country ?? "India",
                latitude: addr.latitude ?? null,
                longitude: addr.longitude ?? null,
                addressType: addr.addressType || "CURRENT",
              })),
            },
          }),
          ...(emergencyContact && {
            emergencyContacts: {
              create: {
                name: emergencyContact.name,
                relation: emergencyContact.relation ?? null,
                phone: emergencyContact.phone,
                email: emergencyContact.email ?? null,
                isPrimary: emergencyContact.isPrimary ?? true,
              },
            },
          }),
          ...(qualifications.length > 0 && {
            qualifications: {
              createMany: {
                data: qualifications.map((q) => ({
                  degree: q.degree,
                  institution: q.institution ?? null,
                  yearOfPassing: q.yearOfPassing ?? null,
                  grade: q.grade ?? null,
                  certificateUrl: q.certificateUrl ?? null,
                })),
              },
            },
          }),
        },
        include: {
          school: { select: { id: true, name: true, schoolCode: true } },
          user: { select: { id: true, email: true, role: true } },
        },
      });

      // 6. Upload files to PocketBase
      if (files.length > 0) {
        console.log("⬆️ Uploading files (public mode)...");
        await ensurePBAuth();

        const uploadedDocs = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const meta = documents[i] || {};
          const documentType = meta.documentType || "OTHER";
          const formData = new FormData();
          formData.append("file", new Blob([file.buffer]), file.originalname);
          formData.append("staffId", staff.id.toString());
          formData.append("documentType", meta.documentType || "OTHER");
          formData.append("title", meta.title || file.originalname);
          formData.append("uploadedById", req.user.id.toString());
          formData.append("mimeType", file.mimetype);
          formData.append("fileSizeBytes", file.size.toString());

          const pbRecord = await pb
            .collection("staff_documents")
            .create(formData);
          console.log(`  ✓ Uploaded: ${pbRecord.id}`);

          uploadedDocs.push({
            staffId: staff.id,
            documentType,
            title: meta.title || file.originalname,
            fileUrl: `${process.env.POCKETBASE_URL}/api/files/staff_documents/${pbRecord.id}/${pbRecord.file}`,
            pocketbaseRecordId: pbRecord.id,
            mimeType: file.mimetype,
            fileSizeBytes: file.size,
            uploadedById: req.user.id,
          });
        }
        console.log(`💾 Saving ${uploadedDocs.length} document records...`);
        await tx.staffDocument.createMany({ data: uploadedDocs });
        console.log("✅ Documents saved");
      }

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
    // if (schoolId) where.schoolId = parseInt(schoolId);
    if (req.user.role !== "ADMIN" && req.user.schoolId) {
      where.schoolId = req.user.schoolId;
    } else if (schoolId) {
      where.schoolId = parseInt(schoolId);
    }
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
        addresses: {
          where: { addressType: "CURRENT" },
          take: 1,
          select: {
            id: true,
            addressLine1: true,
            city: true,
            state: true,
            pinCode: true,
            addressType: true,
          },
        },
        _count: {
          select: { documents: true },
        },
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
        addresses: {
          select: {
            id: true,
            addressLine1: true,
            city: true,
            state: true,
            pinCode: true,
            addressType: true,
            latitude: true,
            longitude: true,
          },
          orderBy: { addressType: "asc" },
        },
        documents: {
          select: {
            id: true,
            documentType: true,
            title: true,
            fileUrl: true,
            mimeType: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: "desc" },
        },
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
  const staffId = Number(id);

  try {
    if (Number.isNaN(staffId)) {
      return sendError(res, 400, "Invalid staff ID", "INVALID_ID");
    }

    // Parse JSON fields (including documentsMeta)
    parseJSONFields(req.body);

    // Map documentsMeta to documents if present
    if (req.body.documentsMeta && !req.body.documents) {
      req.body.documents = req.body.documentsMeta;
    }

    const data = updateStaffSchema.parse(req.body);
    const {
      documents = [],
      addresses = [],
      emergencyContact,
      qualifications,
      ...rest
    } = data;
    const files = req.files || [];

    // Validate file-metadata match
    if (files.length > 0 && documents.length !== files.length) {
      return sendError(
        res,
        400,
        `Found ${documents.length} document metadata but ${files.length} file(s) uploaded`,
        "FILE_METADATA_MISMATCH",
      );
    }

    const existing = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, schoolId: true, email: true, employeeStatus: true },
    });

    if (!existing) return sendError(res, 404, "Staff not found");

    if (req.user.schoolId && req.user.schoolId !== existing.schoolId) {
      return sendError(
        res,
        403,
        "Not authorized to update this staff",
        "FORBIDDEN",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updateData = buildStaffBase(data);

      // 1. Replace addresses
      if (addresses !== undefined) {
        await tx.address.deleteMany({ where: { staffId } });
        if (addresses.length > 0) {
          await tx.address.createMany({
            data: addresses.map((addr) => ({ ...addr, staffId })),
          });
        }
      }

      // 2. Replace emergency contact (delete primary, then create new)
      if (emergencyContact !== undefined) {
        await tx.staffEmergencyContact.deleteMany({
          where: { staffId, isPrimary: true },
        });
        if (emergencyContact && Object.keys(emergencyContact).length) {
          await tx.staffEmergencyContact.create({
            data: {
              ...emergencyContact,
              staffId,
              isPrimary: true,
            },
          });
        }
      }

      // 3. Replace qualifications
      if (qualifications !== undefined) {
        await tx.staffQualification.deleteMany({ where: { staffId } });
        if (qualifications.length > 0) {
          await tx.staffQualification.createMany({
            data: qualifications.map((q) => ({
              degree: q.degree,
              institution: q.institution ?? null,
              yearOfPassing: q.yearOfPassing ?? null,
              grade: q.grade ?? null,
              certificateUrl: q.certificateUrl ?? null,
              staffId,
            })),
          });
        }
      }

      // 4. Update main staff record
      const updatedStaff = await tx.staff.update({
        where: { id: staffId },
        data: {
          ...updateData,
          updatedById: req.user.id,
        },
        include: {
          school: { select: { id: true, name: true } },
          user: { select: { email: true } },
        },
      });

      // 5. Handle documents
      if (files.length > 0) {
        await ensurePBAuth();

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const meta = documents[i] || {};
          if (meta.id && typeof meta.id === "string")
            meta.id = parseInt(meta.id, 10);

          let pbRecord;

          if (meta.id) {
            // ✅ Use transaction client for the query
            const existingDoc = await tx.staffDocument.findUnique({
              where: { id: meta.id },
              select: { pocketbaseRecordId: true },
            });
            if (!existingDoc?.pocketbaseRecordId) {
              throw new Error(`Document ${meta.id} not found`);
            }

            const formData = new FormData();
            formData.append("file", new Blob([file.buffer]), file.originalname);
            formData.append("documentType", meta.documentType || "OTHER");
            formData.append("title", meta.title || file.originalname);
            formData.append("uploadedById", req.user.id.toString());
            formData.append("mimeType", file.mimetype);
            formData.append("fileSizeBytes", file.size.toString());

            pbRecord = await pb
              .collection("staff_documents")
              .update(existingDoc.pocketbaseRecordId, formData);

            await tx.staffDocument.update({
              where: { id: meta.id },
              data: {
                documentType: meta.documentType,
                title: meta.title || file.originalname,
                fileUrl: `${process.env.POCKETBASE_URL}/api/files/staff_documents/${pbRecord.id}/${pbRecord.file}`,
                mimeType: file.mimetype,
                fileSizeBytes: file.size,
                uploadedById: req.user.id,
                updatedAt: new Date(),
              },
            });
            console.log(`✅ Document ${meta.id} updated`);
          } else {
            const formData = new FormData();
            formData.append("file", new Blob([file.buffer]), file.originalname);
            formData.append("staffId", staffId.toString());
            formData.append("documentType", meta.documentType || "OTHER");
            formData.append("title", meta.title || file.originalname);
            formData.append("uploadedById", req.user.id.toString());
            formData.append("mimeType", file.mimetype);
            formData.append("fileSizeBytes", file.size.toString());

            pbRecord = await pb.collection("staff_documents").create(formData);

            await tx.staffDocument.create({
              data: {
                staffId,
                documentType: meta.documentType,
                title: meta.title || file.originalname,
                fileUrl: `${process.env.POCKETBASE_URL}/api/files/staff_documents/${pbRecord.id}/${pbRecord.file}`,
                pocketbaseRecordId: pbRecord.id,
                mimeType: file.mimetype,
                fileSizeBytes: file.size,
                uploadedById: req.user.id,
              },
            });
            console.log(
              `✅ New document created (PocketBase ID: ${pbRecord.id})`,
            );
          }
        }
      }

      return updatedStaff;
    });

    return sendSuccess(res, 200, result, "Staff updated successfully");
  } catch (err) {
    // Enhanced error logging
    console.error("=== UPDATE STAFF ERROR ===");
    console.error("Staff ID:", staffId);
    console.error("User ID:", req.user?.id, "Role:", req.user?.role);
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    if (err instanceof z.ZodError) {
      console.error(
        "Zod validation errors:",
        JSON.stringify(err.errors, null, 2),
      );
    } else if (err.code === "P2002") {
      console.error("Prisma unique constraint violation:", err.meta);
    } else if (err.status === 400 && err.response?.data) {
      console.error("PocketBase error:", err.response.data);
    } else {
      console.error("Stack trace:", err.stack);
    }

    // Zod validation error
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }

    // Prisma specific errors
    if (err.code === "P2025") {
      return sendError(res, 404, "Staff member not found", "NOT_FOUND");
    }
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Unique field conflict (email/employeeId)",
        "CONFLICT",
      );
    }

    // PocketBase errors
    if (err.status === 400 && err.response?.data) {
      return sendError(
        res,
        500,
        "PocketBase upload failed: " +
          (err.response.data.message || "Validation error"),
        "POCKETBASE_ERROR",
      );
    }

    // Fallback
    return sendError(
      res,
      500,
      "Failed to update staff member",
      err.message || "Internal error",
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
