import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { resolveAcademicYearId } from "../utils/resolveAcademicYear.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";
import pb, { ensurePBAuth } from "../utils/pocketbase.js";
import z from "zod";
import { sendNotification } from "../utils/notificationService.js";

const parseJSONFields = (body) => {
  const fields = ["documents", "documentsMeta"];
  for (const field of fields) {
    if (typeof body[field] === "string") {
      try {
        body[field] = JSON.parse(body[field]);
      } catch (e) {
        // leave as string; Zod will catch invalid format
      }
    }
  }
  return body;
};

const announcementDocumentInputSchema = z.object({
  id: z.number().int().positive().optional(),
  documentType: z.enum(["NOTICE", "EVENT", "ATTACHMENT"]).optional(),
  title: z.string().optional(),
  _delete: z.boolean().optional().default(false),
});

// Add media to the schema
const announcementCreateSchema = z.object({
  type: z.enum(["NOTICE", "EVENT"]),
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  link: z.string().url().optional(),
  classroomId: z.coerce.number().int().positive().optional(),
  streamId: z.coerce.number().int().positive().optional(),
  schoolId: z.coerce.number().int().positive(),
  academicYearId: z.coerce.number().int().positive().optional(),
});

const announcementUpdateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").optional(),
  description: z.string().optional(),
  link: z.string().url().optional(),
  classroomId: z.coerce.number().int().positive().optional(),
  streamId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  documents: z.array(announcementDocumentInputSchema).optional(),
});

export const createAnnouncement = async (req, res) => {
  try {
    if (!req.user?.id) {
      return sendError(
        res,
        401,
        "Invalid authentication context",
        "UNAUTHORIZED",
      );
    }

    // Parse JSON fields (documents) from multipart/form-data
    parseJSONFields(req.body);

    if (req.body.documentsMeta && !req.body.documents) {
      req.body.documents = req.body.documentsMeta;
    }

    // Validate body
    const data = announcementCreateSchema.parse(req.body);
    const {
      type,
      title,
      description,
      link,
      classroomId,
      streamId,
      schoolId,
      academicYearId,
    } = data;

    const lowerType = type.toLowerCase();

    const files = req.files || [];
    const metadata = req.body.documents || [];

    if (metadata.length !== files.length) {
      return sendError(
        res,
        400,
        `Expected ${metadata.length} document metadata entries but got ${files.length} files`,
        "FILE_METADATA_MISMATCH",
      );
    }

    // Resolve academic year
    let resolvedAcademicYearId;
    try {
      resolvedAcademicYearId = await resolveAcademicYearId({
        academicYearId,
        schoolId,
      });
    } catch (err) {
      return sendError(res, 400, err.message, "ACADEMIC_YEAR_ERROR");
    }

    // Validate classroom (if provided)
    let classroom;
    if (classroomId) {
      classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: { schoolId: true, name: true },
      });
      if (!classroom || classroom.schoolId !== Number(schoolId)) {
        return sendError(
          res,
          400,
          "Invalid or unauthorized classroom",
          "VALIDATION_ERROR",
        );
      }
      const className = classroom.name.toString().toLowerCase();
      const isClass11Or12 =
        className === "11" ||
        className === "12" ||
        className.includes("11") ||
        className.includes("12");
      if (!isClass11Or12 && streamId) {
        return sendError(
          res,
          400,
          "Stream can only be assigned for Class 11 and 12",
          "VALIDATION_ERROR",
        );
      }
    }

    // Validate stream (if provided)
    if (streamId) {
      const streamExists = await prisma.stream.findUnique({
        where: { id: streamId },
      });
      if (!streamExists)
        return sendError(res, 404, "Stream not found", "NOT_FOUND");
    }

    // Create announcement and documents in transaction
    const announcement = await prisma.$transaction(async (tx) => {
      const newAnnouncement = await tx.announcement.create({
        data: {
          type: lowerType,
          title: title.trim(),
          description: description?.trim(),
          link: link?.trim(),
          classroom: classroomId ? { connect: { id: classroomId } } : undefined,
          stream: streamId ? { connect: { id: streamId } } : undefined,
          school: { connect: { id: schoolId } },
          createdBy: { connect: { id: req.user.id } },
          createdByRole: req.user.role,
          academicYear: { connect: { id: resolvedAcademicYearId } },
        },
      });

      // Upload files
      if (files.length > 0) {
        await ensurePBAuth();

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const meta = metadata[i] || {};

          const formData = new FormData();
          const blob = new Blob([file.buffer], { type: file.mimetype });
          formData.append("file", blob, file.originalname);
          formData.append("announcementId", newAnnouncement.id.toString());
          formData.append("documentType", meta.documentType || "ATTACHMENT");
          formData.append("title", meta.title || file.originalname);
          formData.append("uploadedById", req.user.id.toString());
          formData.append("mimeType", file.mimetype);
          formData.append("fileSizeBytes", file.size.toString());

          const pbRecord = await pb
            .collection("announcement_documents")
            .create(formData);

          await tx.announcementDocument.create({
            data: {
              announcementId: newAnnouncement.id,
              documentType: meta.documentType || "ATTACHMENT",
              title: meta.title || file.originalname,
              fileUrl: `${process.env.POCKETBASE_URL}/api/files/announcement_documents/${pbRecord.id}/${pbRecord.file}`,
              pocketbaseRecordId: pbRecord.id,
              mimeType: file.mimetype,
              fileSizeBytes: file.size,
              uploadedById: req.user.id,
            },
          });
        }
      }

      // Return full announcement with relations
      return await tx.announcement.findUnique({
        where: { id: newAnnouncement.id },
        include: {
          academicYear: { select: { id: true, label: true } },
          stream: streamId ? { select: { id: true, name: true } } : undefined,
          classroom: classroomId
            ? { select: { id: true, name: true, section: true } }
            : undefined,
          createdBy: { select: { id: true, email: true, role: true } },
          documents: true,
        },
      });
    });


    // ==================== SEND NOTIFICATIONS ====================

    // Get all students who should receive this announcement
    const targetStudents = await prisma.student.findMany({
      where: {
        OR: [
          { classroomId: announcement.classroomId },
          announcement.streamId 
            ? { studentStreams: { some: { streamId: announcement.streamId } } }
            : {},
        ],
      },
      select: { id: true, userId: true },
    });

    // Send notification to each student
    for (const student of targetStudents) {
      if (student.userId) {
        await sendNotification({
          userId: student.userId,
          title: announcement.title,
          message: announcement.description || "New announcement from school",
          type: "ANNOUNCEMENT",
          data: { 
            announcementId: announcement.id,
            type: announcement.type 
          },
          studentId: student.id,
          announcementId: announcement.id,
        });
      }
    }

    // Optional: Also notify staff who created it (for confirmation)
    await sendNotification({
      userId: req.user.id,
      title: "Announcement Created",
      message: `Your announcement "${announcement.title}" has been published.`,
      type: "SYSTEM",
      data: { announcementId: announcement.id },
    });

    return sendSuccess(
      res,
      201,
      announcement,
      "Announcement created successfully",
    );
  } catch (err) {
    console.error("Create announcement error:", err);
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    if (err.code === "P2025") {
      return sendError(
        res,
        404,
        "School, stream, classroom, or academic year not found",
        "NOT_FOUND",
      );
    }
    return sendError(
      res,
      500,
      "Failed to create announcement",
      "INTERNAL_ERROR",
    );
  }
};

export const getAnnouncements = async (req, res) => {
  const {
    schoolId,
    type,
    classroomId,
    streamId,
    academicYearId,
    page = 1,
    limit = 20,
  } = req.query;

  if (!schoolId) {
    return sendError(res, 400, "schoolId is required", "VALIDATION_ERROR");
  }

  try {
    let resolvedAcademicYearId;
    try {
      resolvedAcademicYearId = await resolveAcademicYearId({
        academicYearId,
        schoolId,
      });
    } catch (err) {
      return sendError(res, 400, err.message, "ACADEMIC_YEAR_ERROR");
    }

    const where = {
      schoolId: Number(schoolId),
      academicYearId: Number(resolvedAcademicYearId),
      isSuspended: false,
    };

    if (type) where.type = type.toLowerCase();
    if (classroomId) where.classroomId = Number(classroomId);
    if (streamId) where.streamId = Number(streamId);

    // Role-based restrictions (optional — expand if needed)
    const role = req.user.role;
    if (role === "PARENT" || role === "STUDENT") {
      return sendError(
        res,
        403,
        "Use /my-announcements for student/parent view",
        "FORBIDDEN",
      );
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, announcements] = await prisma.$transaction([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          link: true,
          isSuspended: true,
          createdAt: true,
          classroom: {
            select: { id: true, name: true, section: true },
          },
          stream: { select: { id: true, name: true } },
          academicYear: { select: { label: true } },
          createdBy: {
            select: {
              role: true,
              staff: { select: { name: true } },
            },
          },
          documents: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return sendSuccess(
      res,
      200,
      announcements,
      "Announcements fetched successfully",
      {
        total,
        pages: Math.ceil(total / take),
        currentPage: Number(page),
        perPage: take,
        hasNext: Number(page) < Math.ceil(total / take),
        hasPrev: Number(page) > 1,
      },
    );
  } catch (err) {
    console.error("Get announcements error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch announcements",
      "INTERNAL_ERROR",
    );
  }
};

// API For APP

export const getMyAnnouncements = async (req, res) => {
  const { type, page = 1, limit = 20 } = req.query;

  const user = req.user;
  const schoolId = user.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "Unable to determine school context",
      "VALIDATION_ERROR",
    );
  }

  try {
    let resolvedAcademicYearId;
    try {
      resolvedAcademicYearId = (await getActiveAcademicYear(schoolId))?.id;
      if (!resolvedAcademicYearId) {
        return sendError(
          res,
          400,
          "No active academic year found",
          "ACADEMIC_YEAR_ERROR",
        );
      }
    } catch (err) {
      return sendError(res, 400, err.message, "ACADEMIC_YEAR_ERROR");
    }

    // Determine studentId + classroomId + streamId
    let studentId, classroomId, streamId;

    if (user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          schoolId: true,
          studentStreams: {
            where: { academicYearId: resolvedAcademicYearId },
            take: 1,
            include: {
              classroom: { select: { id: true } },
              stream: { select: { id: true } },
            },
          },
        },
      });

      if (!student)
        return sendError(res, 404, "Student profile not found", "NOT_FOUND");
      if (user.schoolId && student.schoolId !== user.schoolId) {
        return sendError(
          res,
          403,
          "Not authorized for this student",
          "FORBIDDEN",
        );
      }

      studentId = student.id;
      const enrollment = student.studentStreams?.[0];
      classroomId = enrollment?.classroom?.id;
      streamId = enrollment?.stream?.id;
    } else if (user.role === "PARENT") {
      const actingStudentId = user.actingAsStudentId;
      if (!actingStudentId) {
        return sendError(
          res,
          403,
          "Please select a child first",
          "CHILD_NOT_SELECTED",
        );
      }
      studentId = actingStudentId;

      const link = await prisma.studentParent.findFirst({
        where: {
          parent: { userId: user.id },
          studentId: actingStudentId,
        },
        select: {
          student: {
            select: {
              schoolId: true,
              studentStreams: {
                where: { academicYearId: resolvedAcademicYearId },
                take: 1,
                include: {
                  classroom: { select: { id: true } },
                  stream: { select: { id: true } },
                },
              },
            },
          },
        },
      });

      if (!link)
        return sendError(
          res,
          403,
          "Not authorized for this student",
          "FORBIDDEN",
        );
      if (user.schoolId && link.student.schoolId !== user.schoolId) {
        return sendError(
          res,
          403,
          "Not authorized for this student's school",
          "FORBIDDEN",
        );
      }

      const enrollment = link.student.studentStreams?.[0];
      classroomId = enrollment?.classroom?.id;
      streamId = enrollment?.stream?.id;
    } else {
      return sendError(
        res,
        403,
        "Only students or parents can access this",
        "FORBIDDEN",
      );
    }

    if (!classroomId) {
      return sendSuccess(
        res,
        200,
        [],
        "No class enrollment found for announcements",
        {
          total: 0,
          pages: 0,
          currentPage: 1,
          perPage: Number(limit),
        },
      );
    }

    // Filter: announcements for this classroom OR this stream
    const where = {
      schoolId: Number(schoolId),
      academicYearId: Number(resolvedAcademicYearId),
      isSuspended: false,
      OR: [
        { classroomId: Number(classroomId) },
        ...(streamId ? [{ streamId: Number(streamId) }] : []),
      ],
    };

    if (type) where.type = type.toLowerCase();

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [total, announcements] = await prisma.$transaction([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        skip,
        take: limitNum,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          link: true,
          isSuspended: true,
          createdAt: true,
          classroom: {
            select: { id: true, name: true, section: true },
          },
          stream: { select: { id: true, name: true } },
          academicYear: { select: { label: true } },
          createdBy: {
            select: {
              role: true,
              staff: { select: { name: true } },
            },
          },
          documents: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return sendSuccess(
      res,
      200,
      announcements,
      "Relevant announcements fetched successfully",
      {
        total,
        pages: Math.ceil(total / limitNum),
        currentPage: pageNum,
        perPage: limitNum,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    );
  } catch (err) {
    console.error("Get my announcements error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch announcements",
      "INTERNAL_ERROR",
    );
  }
};

// New endpoint: /api/announcements/universal
export const getUniversalAnnouncements = async (req, res) => {
  const { type, page = 1, limit = 20 } = req.query;

  const user = req.user;
  const schoolId = user.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "Unable to determine school context",
      "VALIDATION_ERROR",
    );
  }

  try {
    let resolvedAcademicYearId;
    try {
      resolvedAcademicYearId = (await getActiveAcademicYear(schoolId))?.id;
      if (!resolvedAcademicYearId) {
        return sendError(
          res,
          400,
          "No active academic year found",
          "ACADEMIC_YEAR_ERROR",
        );
      }
    } catch (err) {
      return sendError(res, 400, err.message, "ACADEMIC_YEAR_ERROR");
    }

    const where = {
      schoolId: Number(schoolId),
      academicYearId: Number(resolvedAcademicYearId),
      isSuspended: false,
      classroomId: null,
      streamId: null,
    };

    if (type) where.type = type.toLowerCase();

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [total, announcements] = await prisma.$transaction([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        skip,
        take: limitNum,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          link: true,
          isSuspended: true,
          createdAt: true,
          classroom: {
            select: { id: true, name: true, section: true },
          },
          stream: { select: { id: true, name: true } },
          academicYear: { select: { label: true } },
          createdBy: {
            select: {
              role: true,
              staff: { select: { name: true } },
            },
          },
          documents: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return sendSuccess(
      res,
      200,
      announcements,
      "Universal announcements fetched successfully",
      {
        total,
        pages: Math.ceil(total / limitNum),
        currentPage: pageNum,
        perPage: limitNum,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    );
  } catch (err) {
    console.error("Get universal announcements error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch universal announcements",
      "INTERNAL_ERROR",
    );
  }
};

export const getAnnouncement = async (req, res) => {
  return sendSuccess(
    res,
    200,
    req.announcement,
    "Announcement fetched successfully",
  );
};

// UPDATE Announ

export const updateAnnouncement = async (req, res) => {
  try {
    // 1. Parse JSON fields (documents)
    parseJSONFields(req.body);

    // 2. Validate the update data
    const data = announcementUpdateSchema.parse(req.body);
    const {
      title,
      description,
      link,
      classroomId,
      streamId,
      academicYearId,
      documents = [],
    } = data;
    const files = req.files || [];

    // 3. Prepare update data for the announcement itself
    const updateData = {};
    if (title) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (link !== undefined) updateData.link = link?.trim();

    if (classroomId !== undefined) {
      updateData.classroom = classroomId
        ? { connect: { id: classroomId } }
        : { disconnect: true };
    }
    if (streamId !== undefined) {
      updateData.stream = streamId
        ? { connect: { id: streamId } }
        : { disconnect: true };
    }
    if (academicYearId) {
      updateData.academicYear = { connect: { id: academicYearId } };
    }

    // 4. Run the update transaction
    const updatedAnnouncement = await prisma.$transaction(async (tx) => {
      // a) Update the announcement record
      const announcement = await tx.announcement.update({
        where: { id: req.announcement.id },
        data: updateData,
      });

      // b) Process deletions (documents with _delete: true)
      const docsToDelete = documents.filter((doc) => doc._delete && doc.id);
      if (docsToDelete.length) {
        await tx.announcementDocument.deleteMany({
          where: {
            id: { in: docsToDelete.map((d) => d.id) },
            announcementId: announcement.id,
          },
        });
      }

      // c) Process files (they correspond 1:1 with documents metadata, in order)
      if (files.length) {
        // Ensure metadata count matches file count
        if (documents.length !== files.length) {
          throw new Error(
            `Metadata count (${documents.length}) does not match file count (${files.length})`,
          );
        }

        await ensurePBAuth();

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const meta = documents[i];

          if (!meta) {
            throw new Error(`Missing metadata for file at index ${i}`);
          }

          // Build PocketBase form data
          const formData = new FormData();
          const blob = new Blob([file.buffer], { type: file.mimetype });
          formData.append("file", blob, file.originalname);
          formData.append("announcementId", announcement.id.toString());
          formData.append("documentType", meta.documentType || "ATTACHMENT");
          formData.append("title", meta.title || file.originalname);
          formData.append("uploadedById", req.user.id.toString());
          formData.append("mimeType", file.mimetype);
          formData.append("fileSizeBytes", file.size.toString());

          if (meta.id) {
            // Update existing document
            const existingDoc = await tx.announcementDocument.findUnique({
              where: { id: meta.id },
              select: { pocketbaseRecordId: true },
            });
            if (!existingDoc?.pocketbaseRecordId) {
              throw new Error(`Document ${meta.id} not found`);
            }

            const pbRecord = await pb
              .collection("announcement_documents")
              .update(existingDoc.pocketbaseRecordId, formData);

            await tx.announcementDocument.update({
              where: { id: meta.id },
              data: {
                documentType: meta.documentType || "ATTACHMENT",
                title: meta.title || file.originalname,
                fileUrl: `${process.env.POCKETBASE_URL}/api/files/announcement_documents/${pbRecord.id}/${pbRecord.file}`,
                mimeType: file.mimetype,
                fileSizeBytes: file.size,
                uploadedById: req.user.id,
                updatedAt: new Date(),
              },
            });
          } else {
            // Create new document
            const pbRecord = await pb
              .collection("announcement_documents")
              .create(formData);

            await tx.announcementDocument.create({
              data: {
                announcementId: announcement.id,
                documentType: meta.documentType || "ATTACHMENT",
                title: meta.title || file.originalname,
                fileUrl: `${process.env.POCKETBASE_URL}/api/files/announcement_documents/${pbRecord.id}/${pbRecord.file}`,
                pocketbaseRecordId: pbRecord.id,
                mimeType: file.mimetype,
                fileSizeBytes: file.size,
                uploadedById: req.user.id,
              },
            });
          }
        }
      }

      // d) Return the updated announcement with all relations
      return await tx.announcement.findUnique({
        where: { id: announcement.id },
        include: {
          academicYear: { select: { id: true, label: true } },
          stream: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
          createdBy: { select: { id: true, email: true, role: true } },
          documents: true,
        },
      });
    });

    return sendSuccess(
      res,
      200,
      updatedAnnouncement,
      "Announcement updated successfully",
    );
  } catch (err) {
    console.error("Update announcement error:", err);
    if (err instanceof z.ZodError && Array.isArray(err.errors)) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    if (err.code === "P2025") {
      return sendError(res, 404, "Announcement not found", "NOT_FOUND");
    }
    return sendError(
      res,
      500,
      "Failed to update announcement",
      "INTERNAL_ERROR",
    );
  }
};

// SUSPEND Event Announ
export const suspendEvent = async (req, res) => {
  if (req.announcement.type !== "event") {
    return sendError(
      res,
      400,
      "Only events can be suspended",
      "INVALID_OPERATION",
    );
  }

  const updated = await prisma.announcement.update({
    where: { id: req.announcement.id },
    data: { isSuspended: true },
  });

  return sendSuccess(res, 200, updated, "Event suspended successfully");
};

// DELETE Announ
export const deleteAnnouncement = async (req, res) => {
  await prisma.announcement.delete({
    where: { id: req.announcement.id },
  });

  return sendSuccess(res, 200, null, "Announcement deleted successfully");
};
