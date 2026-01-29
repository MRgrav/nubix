import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";

const timeToMinutes = (time) => {
  if (!time || typeof time !== "string") return null;

  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  const [, h, m] = match.map(Number);
  return h * 60 + m;
};

export const createSlot = async (req, res) => {
  const {
    day,
    slotType,
    startTime,
    endTime,
    notes,
    schoolId,
    classroomId,
    streamId,
    subjectId,
    teacherId,
    academicYearId,
  } = req.body;

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (startMinutes == null || endMinutes == null) {
    return res.status(400).json({
      error: "startTime and endTime are required in HH:mm format",
    });
  }

  if (endMinutes <= startMinutes) {
    return res.status(400).json({
      error: "endTime must be after startTime",
    });
  }

  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(parseInt(schoolId));
      if (!activeYear)
        return res.status(400).json({ error: "No active academic year" });
      resolvedAcademicYearId = activeYear.id;
    }

    // Overlap check – consider both classroom AND stream
    const overlap = await prisma.timetableSlot.findFirst({
      where: {
        academicYearId: Number(resolvedAcademicYearId),
        day,
        OR: [
          { classroomId: classroomId ? Number(classroomId) : undefined },
          { streamId: streamId ? Number(streamId) : undefined },
        ],
        NOT: {
          OR: [
            { endMinutes: { lte: startMinutes } },
            { startMinutes: { gte: endMinutes } },
          ],
        },
      },
    });

    if (overlap) {
      return sendError(res, 409, "Time slot overlaps with an existing slot");
    }

    const slot = await prisma.timetableSlot.create({
      data: {
        day,
        slotType,
        startMinutes,
        endMinutes,
        notes,
        school: { connect: { id: parseInt(schoolId) } },
        classroom: { connect: { id: parseInt(classroomId) } },
        subject: subjectId
          ? { connect: { id: parseInt(subjectId) } }
          : undefined,
        stream: streamId ? { connect: { id: parseInt(streamId) } } : undefined,
        teacher: teacherId
          ? { connect: { id: parseInt(teacherId) } }
          : undefined,
        academicYear: { connect: { id: parseInt(resolvedAcademicYearId) } },
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        stream: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            label: true,
            isActive: true,
          },
        },
      },
    });

    return sendSuccess(res, 201, slot, "Timetable slot created successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to create slot");
  }
};

export const getSlots = async (req, res) => {
  const {
    schoolId,
    classroomId,
    day,
    academicYearId,
    page = 1,
    perPage = 60,
  } = req.query;
  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId && schoolId) {
      const activeYear = await getActiveAcademicYear(parseInt(schoolId));
      resolvedAcademicYearId = activeYear?.id;
    }

    const where = {
      ...(resolvedAcademicYearId && {
        academicYearId: Number(resolvedAcademicYearId),
      }),
      ...(schoolId && { schoolId: Number(schoolId) }),
      ...(classroomId && { classroomId: Number(classroomId) }),
      ...(day && { day }),
    };

    const pageNumber = Math.max(parseInt(page), 1);
    const limit = Math.max(parseInt(perPage), 1);
    const skip = (pageNumber - 1) * limit;

    const total = await prisma.timetableSlot.count({ where });

    const slots = await prisma.timetableSlot.findMany({
      where,
      include: {
        school: {
          select: {
            id: true,
            name: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            label: true,
            isActive: true,
          },
        },
      },
      orderBy: { startMinutes: "asc" },
    });

    const totalPages = Math.ceil(total / limit);

    return sendSuccess(
      res,
      200,
      slots,
      "Timetable Slots fetched Successfully",
      {
        pagination: {
          total,
          totalPages,
          currentPage: pageNumber,
          perPage: limit,
          hasNext: pageNumber < totalPages,
          hasPrev: pageNumber > 1,
        },
      },
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to Fetch Slots", "INTERNAL_ERROR");
  }
};

export const updateSlot = async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  try {
    // Handle time updates
    if (updates.startTime) {
      const sm = timeToMinutes(updates.startTime);
      if (sm == null) {
        return res.status(400).json({ error: "Invalid startTime format" });
      }
      updates.startMinutes = sm;
    }

    if (updates.endTime) {
      const em = timeToMinutes(updates.endTime);
      if (em == null) {
        return res.status(400).json({ error: "Invalid endTime format" });
      }
      updates.endMinutes = em;
    }

    delete updates.startTime;
    delete updates.endTime;

    if (updates.subjectId) {
      updates.subject = { connect: { id: Number(updates.subjectId) } };
      delete updates.subjectId;
    }

    if (updates.teacherId) {
      updates.teacher = { connect: { id: Number(updates.teacherId) } };
      delete updates.teacherId;
    }

    if (updates.schoolId) {
      updates.school = { connect: { id: Number(updates.schoolId) } };
      delete updates.schoolId;
    }

    if (updates.classroomId) {
      updates.classroom = { connect: { id: Number(updates.classroomId) } };
      delete updates.classroomId;
    }

    if (updates.academicYearId) {
      updates.academicYear = {
        connect: { id: Number(updates.academicYearId) },
      };
      delete updates.academicYearId;
    }

    const slot = await prisma.timetableSlot.update({
      where: { id: Number(id) },
      data: updates,
      include: {
        academicYear: {
          select: {
            id: true,
            label: true,
            isActive: true,
          },
        },
      },
    });

    return res.json(slot);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Slot not found" });
    }
    return res.status(500).json({ error: "Failed to update slot" });
  }
};

export const deleteSlot = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.timetableSlot.delete({ where: { id: parseInt(id) } });
    return sendSuccess(res, 200, null, "Slot deleted successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Slot not found" });
    res.status(500).json({ error: "Failed to delete slot" });
  }
};
