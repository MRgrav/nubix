import prisma from "../models/prisma.js";

import { resolveAcademicYearId } from "../utils/resolveAcademicYear.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";
export const createAnnouncement = async (req, res) => {
  const {
    type,
    title,
    description,
    link,
    media,
    targetClass,
    targetSection,
    streamId,
    schoolId,
    academicYearId,
  } = req.body;

  if (!req.user?.id) {
    return sendError(
      res,
      401,
      "Invalid authentication context",
      "UNAUTHORIZED"
    );
  }

  if (!schoolId || !title || !type) {
    return sendError(
      res,
      400,
      "schoolId, title, and type are required",
      "VALIDATION_ERROR"
    );
  }

  try {
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

    // Stream announcements only allowed for Class 11 and 12
    if (streamId && targetClass && !["11", "12"].includes(targetClass.trim())) {
      return sendError(
        res,
        400,
        "Stream-specific announcements are only allowed for Class 11 and 12",
        "INVALID_STREAM_SCOPE"
      );
    }

    const announcement = await prisma.announcement.create({
      data: {
        type,
        title: title.trim(),
        description: description?.trim(),
        link: link?.trim(),
        media: media?.trim(),
        targetClass: targetClass?.trim(),
        targetSection: targetSection?.trim().toUpperCase(),
        ...(streamId && { stream: { connect: { id: Number(streamId) } } }),
        school: { connect: { id: Number(schoolId) } },
        createdBy: { connect: { id: req.user.id } },
        createdByRole: req.user.role,
        academicYear: { connect: { id: Number(resolvedAcademicYearId) } },
      },
      include: {
        academicYear: { select: { id: true, label: true } },
        stream: streamId ? { select: { id: true, name: true } } : undefined,
        createdBy: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return sendSuccess(
      res,
      201,
      announcement,
      "Announcement created successfully"
    );
  } catch (err) {
    console.error("Create announcement error:", err);
    if (err.code === "P2025") {
      return sendError(
        res,
        404,
        "School, stream, or academic year not found",
        "NOT_FOUND"
      );
    }
    return sendError(
      res,
      500,
      "Failed to create announcement",
      "INTERNAL_ERROR"
    );
  }
};

export const getAnnouncements = async (req, res) => {
  const {
    schoolId,
    type,
    class: targetClass,
    section,
    academicYearId,
    streamId,
    page = 1,
    limit = 20,
  } = req.query;

  const role = req.user.role;

  if (!schoolId) {
    return sendError(res, 400, "schoolId is required", "VALIDATION_ERROR");
  }
  try {
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

    const where = {
      schoolId: Number(schoolId),
      academicYearId: Number(resolvedAcademicYearId),
      isSuspended: false,
    };

    if (type) where.type = type;
    if (targetClass) where.targetClass = targetClass.trim();
    if (section) where.targetSection = section.trim().toUpperCase();
    if (streamId) where.streamId = Number(streamId);

    // Parent visibility: global + their selected child's class/stream
    if (role === "PARENT") {
      const actingStudentId = req.user.actingAsStudentId;

      if (!actingStudentId) {
        return sendError(
          res,
          403,
          "Please select a child first",
          "CHILD_NOT_SELECTED"
        );
      }

      // Fetch selected student's class/stream
      const studentStream = await prisma.studentStream.findFirst({
        where: {
          studentId: actingStudentId,
          academicYearId: Number(resolvedAcademicYearId),
        },
        include: {
          classroom: { select: { name: true, section: true } },
          stream: { select: { id: true } },
        },
      });

      if (!studentStream) {
        // No enrollment → only global
        where.OR = [{ streamId: null }];
      } else {
        const className = studentStream.classroom.name;
        const sectionName = studentStream.classroom.section;
        const studentStreamId = studentStream.stream?.id;

        where.OR = [
          { streamId: null }, // global
          { targetClass: className, targetSection: sectionName }, // class-specific
          ...(studentStreamId ? [{ streamId: studentStreamId }] : []), // stream-specific
        ];
      }
    } else if (role === "STUDENT") {
      // Existing student logic (keep as-is)
      const studentStream = await prisma.studentStream.findFirst({
        where: {
          student: { userId: req.user.id },
          academicYearId: Number(resolvedAcademicYearId),
        },
        select: { streamId: true },
      });

      where.OR = [
        { streamId: null },
        ...(studentStream?.streamId
          ? [{ streamId: studentStream.streamId }]
          : []),
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, announcements] = await prisma.$transaction([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          link: true,
          media: true,
          targetClass: true,
          targetSection: true,
          isSuspended: true,
          createdAt: true,

          stream: {
            select: { name: true },
          },
          academicYear: {
            select: { label: true },
          },
          createdBy: {
            select: {
              role: true,
              staff: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return sendSuccess(res, 200, announcements, "Announcements fetched", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error("Get announcements error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch announcements",
      "INTERNAL_ERROR"
    );
  }
};

export const getAnnouncement = async (req, res) => {
  return sendSuccess(
    res,
    200,
    req.announcement,
    "Announcement fetched successfully"
  );
};

export const updateAnnouncement = async (req, res) => {
  const {
    title,
    description,
    link,
    media,
    targetClass,
    targetSection,
    academicYearId,
    streamId,
  } = req.body;

  try {
    const data = {};
    if (title) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim();
    if (link !== undefined) data.link = link?.trim();
    if (media !== undefined) data.media = media?.trim();
    if (targetClass !== undefined) data.targetClass = targetClass?.trim();
    if (targetSection !== undefined)
      data.targetSection = targetSection?.trim().toUpperCase();

    if (academicYearId) {
      data.academicYear = { connect: { id: Number(academicYearId) } };
    }

    if (streamId !== undefined) {
      data.stream = streamId
        ? { connect: { id: Number(streamId) } }
        : { disconnect: true };
    }

    const updated = await prisma.announcement.update({
      where: { id: req.announcement.id },
      data,
      include: {
        academicYear: { select: { id: true, label: true } },
        stream: { select: { id: true, name: true } },
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
      "INTERNAL_ERROR"
    );
  }
};

export const suspendEvent = async (req, res) => {
  if (req.announcement.type !== "event") {
    return sendError(
      res,
      400,
      "Only events can be suspended",
      "INVALID_OPERATION"
    );
  }

  const updated = await prisma.announcement.update({
    where: { id: req.announcement.id },
    data: { isSuspended: true },
  });

  return sendSuccess(res, 200, updated, "Event suspended successfully");
};

export const deleteAnnouncement = async (req, res) => {
  await prisma.announcement.delete({
    where: { id: req.announcement.id },
  });

  return sendSuccess(res, 200, null, "Announcement deleted successfully");
};
