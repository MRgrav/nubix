import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { resolveAcademicYearId } from "../utils/resolveAcademicYear.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";

export const createAnnouncement = async (req, res) => {
  const {
    type,
    title,
    description,
    link,
    media,
    classroomId,
    streamId,
    schoolId,
    academicYearId,
  } = req.body;

  if (!req.user?.id) {
    return sendError(
      res,
      401,
      "Invalid authentication context",
      "UNAUTHORIZED",
    );
  }

  if (!schoolId || !title || !type) {
    return sendError(
      res,
      400,
      "schoolId, title, and type are required",
      "VALIDATION_ERROR",
    );
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

    // Validate classroom belongs to school (if provided)
    let classroom;

    if (classroomId) {
      classroom = await prisma.classroom.findUnique({
        where: { id: Number(classroomId) },
        select: {
          schoolId: true,
          name: true, // used to detect class 11 / 12
        },
      });

      if (!classroom || classroom.schoolId !== Number(schoolId)) {
        return sendError(
          res,
          400,
          "Invalid or unauthorized classroom",
          "VALIDATION_ERROR",
        );
      }

      // ✅ Stream allowed ONLY for Class 11 & 12
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

    if (streamId) {
      const streamExists = await prisma.stream.findUnique({
        where: { id: Number(streamId) },
        select: { id: true },
      });
      if (!streamExists) {
        return sendError(res, 404, "Stream not found", "NOT_FOUND");
      }
    }

    const announcement = await prisma.announcement.create({
      data: {
        type,
        title: title.trim(),
        description: description?.trim(),
        link: link?.trim(),
        media: media?.trim(),
        classroom: classroomId
          ? { connect: { id: Number(classroomId) } }
          : undefined,
        stream: streamId ? { connect: { id: Number(streamId) } } : undefined,
        school: { connect: { id: Number(schoolId) } },
        createdBy: { connect: { id: req.user.id } },
        createdByRole: req.user.role,
        academicYear: { connect: { id: Number(resolvedAcademicYearId) } },
      },
      include: {
        academicYear: { select: { id: true, label: true } },
        stream: streamId ? { select: { id: true, name: true } } : undefined,
        classroom: classroomId
          ? { select: { id: true, name: true, section: true } }
          : undefined,
        createdBy: {
          select: { id: true, email: true, role: true },
        },
      },
    });

    return sendSuccess(
      res,
      201,
      announcement,
      "Announcement created successfully",
    );
  } catch (err) {
    console.error("Create announcement error:", err);
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
    classroomId, // ← new: filter by classroom ID
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

    if (type) where.type = type;
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
          media: true,
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

    if (type) where.type = type;

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
          media: true,
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

    if (type) where.type = type;

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
          media: true,
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
  const {
    title,
    description,
    link,
    media,
    classroomId,
    streamId,
    academicYearId,
  } = req.body;

  try {
    const data = {};
    if (title) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim();
    if (link !== undefined) data.link = link?.trim();
    if (media !== undefined) data.media = media?.trim();

    if (classroomId !== undefined) {
      data.classroom = classroomId
        ? { connect: { id: Number(classroomId) } }
        : { disconnect: true };
    }

    if (streamId !== undefined) {
      data.stream = streamId
        ? { connect: { id: Number(streamId) } }
        : { disconnect: true };
    }

    if (academicYearId) {
      data.academicYear = { connect: { id: Number(academicYearId) } };
    }

    const updated = await prisma.announcement.update({
      where: { id: req.announcement.id },
      data,
      include: {
        academicYear: { select: { id: true, label: true } },
        stream: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true, section: true } },
      },
    });

    return sendSuccess(res, 200, updated, "Announcement updated successfully");
  } catch (err) {
    console.error("Update announcement error:", err);
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
