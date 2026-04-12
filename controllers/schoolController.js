// controllers/schoolController.js
import prisma from "../models/prisma.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";
import z from "zod";
import pb, { ensurePBAuth } from "../utils/pocketbase.js";

const parseJSONFields = (body) => {
  const fields = ["address", "documents"];
  for (const field of fields) {
    if (typeof body[field] === "string") {
      try {
        body[field] = JSON.parse(body[field]);
      } catch (e) {
        // Leave as string; Zod will catch invalid format
      }
    }
  }
  return body;
};

const schoolAddressSchema = z.object({
  addressLine1: z.string().min(1, "Address line 1 is required"),
  addressLine2: z.string().nullish(),
  landmark: z.string().nullish(),
  city: z.string().min(1),
  district: z.string().nullish(),
  state: z.string().min(1),
  pinCode: z.string().min(1),
  postOffice: z.string().nullish(),
  country: z.string().default("India"),
  addressType: z.enum(["CURRENT", "OTHER"]).default("CURRENT"),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
});

const schoolDocumentMetadataSchema = z.object({
  documentType: z.string().min(1, "Document type is required"),
  title: z.string().optional(),
  id: z.number().int().optional(),
});

const createSchoolSchema = z.object({
  name: z.string().min(3, "School name must be at least 3 characters"),
  schoolCode: z
    .string()
    .trim()
    .length(5, "School code must be exactly 5 characters")
    .regex(/^\d{5}$/, "School code must be exactly 5 digits (00000-99999)"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geoRadiusMeters: z.number().int().min(10).max(500).optional(),
  address: schoolAddressSchema.optional(),
  documents: z.array(schoolDocumentMetadataSchema).optional(),
});

const updateSchoolSchema = z.object({
  name: z
    .string()
    .min(3, "School name must be at least 3 characters")
    .optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geoRadiusMeters: z.number().int().min(10).max(500).optional(),
  address: schoolAddressSchema.optional(),
  documents: z.array(schoolDocumentMetadataSchema).optional(),
});

export const createSchool = async (req, res) => {
  try {
    parseJSONFields(req.body);

    const validated = createSchoolSchema.parse(req.body);
    const {
      name,
      schoolCode,
      latitude,
      longitude,
      geoRadiusMeters,
      address,
      documents,
    } = validated;

    const normalizedCode = schoolCode?.trim();
    const normalizedName = name?.trim();

    // Check for duplicates
    const [existingByCode, existingByName] = await Promise.all([
      prisma.school.findUnique({ where: { schoolCode: normalizedCode } }),
      prisma.school.findFirst({
        where: { name: { equals: normalizedName, mode: "insensitive" } },
      }),
    ]);

    if (existingByCode) {
      return sendError(res, 409, "School code already exists", "CODE_CONFLICT");
    }
    if (existingByName) {
      return sendError(res, 409, "School name already exists", "NAME_CONFLICT");
    }

    const files = req.files || [];
    // if (documents.length > files.length) {
    //   return sendError(
    //     res,
    //     400,
    //     `Missing files: expected ${documents.length} but got ${files.length}`,
    //     "FILE_MISSING",
    //   );
    // }

    const school = await prisma.$transaction(async (tx) => {
      const newSchool = await tx.school.create({
        data: {
          name: normalizedName,
          schoolCode: normalizedCode,
          address: address ? { create: address } : undefined,
        },
        include: { address: true },
      });

      let uploadedDocs = [];
      if (files.length > 0) {
        await ensurePBAuth();

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const meta = documents[i] || {};

          const formData = new FormData();
          formData.append("file", new Blob([file.buffer]), file.originalname);
          formData.append("schoolId", newSchool.id.toString());
          formData.append("documentType", meta.documentType);
          formData.append("title", meta.title || file.originalname);
          formData.append("uploadedById", req.user.id.toString());
          formData.append("mimeType", file.mimetype);
          formData.append("fileSizeBytes", file.size.toString());

          const pbRecord = await pb
            .collection("school_documents")
            .create(formData);

          uploadedDocs.push({
            schoolId: newSchool.id,
            documentType: meta.documentType,
            title: meta.title || file.originalname,
            fileUrl: `${process.env.POCKETBASE_URL}/api/files/school_documents/${pbRecord.id}/${pbRecord.file}`,
            pocketbaseRecordId: pbRecord.id,
            mimeType: file.mimetype,
            fileSizeBytes: file.size,
            uploadedById: req.user.id,
          });
        }
      }
      if (uploadedDocs.length > 0) {
        console.log(`💾 Saving ${uploadedDocs.length} document records...`);
        await tx.schoolDocument.createMany({ data: uploadedDocs });
        console.log("✅ Documents saved");
      }

      return newSchool;
    });

    return sendSuccess(res, 201, school, "School created successfully");
  } catch (err) {
    console.error("Create school error:", err);

    // Zod validation error
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }

    // Prisma unique constraint violation
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Unique constraint violation",
        "DUPLICATE_ENTRY",
      );
    }

    // Other errors
    return sendError(res, 500, "Failed to create school", "INTERNAL_ERROR");
  }
};

export const getSchools = async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    sortBy = "name",
    order = "asc",
  } = req.query;

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { schoolCode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [total, schools] = await prisma.$transaction([
      prisma.school.count({ where }),
      prisma.school.findMany({
        where,
        include: {
          address: true,
          documents: true,
          _count: {
            select: { students: true, staff: true },
          },
        },
        orderBy: { [sortBy]: order },
        skip,
        take: parseInt(limit),
      }),
    ]);

    return sendSuccess(res, 200, schools, "Schools fetched successfully", {
      pagination: {
        total,
        pages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        perPage: parseInt(limit),
      },
    });
  } catch (err) {
    console.error("Get schools error:", err);
    return sendError(res, 500, "Failed to fetch schools", "INTERNAL_ERROR");
  }
};

export const getSchool = async (req, res) => {
  const { id } = req.params;

  try {
    const school = await prisma.school.findUnique({
      where: { id: parseInt(id) },
      include: {
        address: true,
        documents: true,
        _count: {
          select: { students: true, staff: true, classrooms: true },
        },
      },
    });

    if (!school) {
      return sendError(res, 404, "School not found", "NOT_FOUND");
    }

    return sendSuccess(res, 200, school, "School details fetched successfully");
  } catch (err) {
    console.error("Get school error:", err);
    return sendError(res, 500, "Failed to fetch school", "INTERNAL_ERROR");
  }
};

export const updateSchool = async (req, res) => {
  const { id } = req.params;
  const schoolId = Number(id);

  try {
    if (Number.isNaN(schoolId)) {
      return sendError(res, 400, "Invalid school ID", "INVALID_ID");
    }

    // Check if school exists
    const schoolExist = await prisma.school.findUnique({
      where: { id: schoolId },
    });
    if (!schoolExist) {
      return sendError(res, 404, "School not found", "NOT_FOUND");
    }

    // Parse JSON fields
    parseJSONFields(req.body);

    // Validate with Zod
    const validated = updateSchoolSchema.parse(req.body);
    const {
      name,
      latitude,
      longitude,
      geoRadiusMeters,
      address,
      documents = [],
    } = validated;
    const files = req.files || [];

    // 1. Ensure the number of file uploads matches the metadata count
    if (files.length > 0 && documents.length !== files.length) {
      return sendError(
        res,
        400,
        `Expected ${documents.length} files but got ${files.length}`,
        "FILE_MISMATCH",
      );
    }

    // 2. (Optional) Prevent duplicate document types in the same request
    const documentTypes = documents.map((d) => d.documentType).filter(Boolean);
    if (new Set(documentTypes).size !== documentTypes.length) {
      return sendError(
        res,
        400,
        "Duplicate document types found in the request",
        "DUPLICATE_DOC_TYPE",
      );
    }

    // Transaction
    const updatedSchool = await prisma.$transaction(async (tx) => {
      const updateData = {};
      if (name) updateData.name = name.trim();
      if (latitude !== undefined) updateData.latitude = latitude;
      if (longitude !== undefined) updateData.longitude = longitude;
      if (geoRadiusMeters !== undefined)
        updateData.geoRadiusMeters = geoRadiusMeters;

      // Handle address (upsert)
      if (address) {
        updateData.address = {
          upsert: {
            where: { schoolId },
            update: address,
            create: address,
          },
        };
      }

      // Update school scalar fields + address
      const school = await tx.school.update({
        where: { id: schoolId },
        data: updateData,
        include: { address: true, documents: true },
      });

      // Handle documents (update or create)
      if (files.length > 0) {
        await ensurePBAuth();

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const meta = documents[i] || {};
          const docId = meta.id;
          const docType = meta.documentType;
          const docTitle = meta.title || file.originalname;

          // If id is provided, use it to update
          let existingDoc = null;
          if (docId) {
            existingDoc = await tx.schoolDocument.findUnique({
              where: { id: docId },
              select: { pocketbaseRecordId: true, documentType: true },
            });
          } else if (docType) {
            // No id → try to find by (schoolId, documentType)
            existingDoc = await tx.schoolDocument.findFirst({
              where: { schoolId, documentType: docType },
              select: {
                id: true,
                pocketbaseRecordId: true,
                documentType: true,
              },
            });
          }

          const formData = new FormData();
          formData.append("file", new Blob([file.buffer]), file.originalname);
          formData.append("schoolId", schoolId.toString());
          formData.append("documentType", docType);
          formData.append("title", docTitle);
          formData.append("uploadedById", req.user.id.toString());
          formData.append("mimeType", file.mimetype);
          formData.append("fileSizeBytes", file.size.toString());

          if (existingDoc?.pocketbaseRecordId) {
            // --- Update existing document ---
            const pbRecord = await pb
              .collection("school_documents")
              .update(existingDoc.pocketbaseRecordId, formData);

            await tx.schoolDocument.update({
              where: { id: existingDoc.id },
              data: {
                documentType: docType,
                title: docTitle,
                fileUrl: `${process.env.POCKETBASE_URL}/api/files/school_documents/${pbRecord.id}/${pbRecord.file}`,
                mimeType: file.mimetype,
                fileSizeBytes: file.size,
                uploadedById: req.user.id,
                updatedAt: new Date(),
              },
            });
            console.log(
              `✅ Document ${existingDoc.id} updated (type: ${docType})`,
            );
          } else {
            // --- Create new document ---
            const pbRecord = await pb
              .collection("school_documents")
              .create(formData);

            await tx.schoolDocument.create({
              data: {
                schoolId,
                documentType: docType,
                title: docTitle,
                fileUrl: `${process.env.POCKETBASE_URL}/api/files/school_documents/${pbRecord.id}/${pbRecord.file}`,
                pocketbaseRecordId: pbRecord.id,
                mimeType: file.mimetype,
                fileSizeBytes: file.size,
                uploadedById: req.user.id,
              },
            });
            console.log(`✅ New document created (type: ${docType})`);
          }
        }
      }

      // Return the full school with all relations
      return await tx.school.findUnique({
        where: { id: schoolId },
        include: { address: true, documents: true },
      });
    });

    return sendSuccess(res, 200, updatedSchool, "School updated successfully");
  } catch (err) {
    console.error("Update school error:", err);

    if (err instanceof z.ZodError && Array.isArray(err.errors)) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }

    if (err.code === "P2025") {
      return sendError(res, 404, "School not found", "NOT_FOUND");
    }

    return sendError(res, 500, "Failed to update school", "INTERNAL_ERROR");
  }
};

export const deleteSchool = async (req, res) => {
  const { id } = req.params;

  try {
    const schoolId = parseInt(id);

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        _count: {
          select: { students: true, staff: true },
        },
      },
    });

    if (!school) {
      return sendError(res, 404, "School not found", "NOT_FOUND");
    }

    if (school._count.students > 0 || school._count.staff > 0) {
      return sendError(
        res,
        409,
        "Cannot delete school with existing students or staff",
        "DEPENDENCY_CONFLICT",
      );
    }

    await prisma.school.delete({
      where: { id: schoolId },
    });

    return sendSuccess(res, 200, null, "School deleted successfully");
  } catch (err) {
    console.error("Delete school error:", err);
    return sendError(res, 500, "Failed to delete school", "INTERNAL_ERROR");
  }
};
