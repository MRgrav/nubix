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
  try {
    let {
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
      return sendError(
        res,
        400,
        "startTime and endTime are required in HH:mm format",
      );
    }

    if (endMinutes <= startMinutes) {
      return sendError(res, 400, "endTime must be after startTime");
    }

    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(parseInt(schoolId));
      if (!activeYear) return sendError(res, 400, "No active academic year");
      resolvedAcademicYearId = activeYear.id;
    }

    // Slot type validation
    if (slotType !== "CLASS") {
      subjectId = null;
      teacherId = null;
    } else {
      if (!subjectId && !teacherId) {
        return sendError(
          res,
          400,
          "CLASS slot requires subjectId or teacherId",
        );
      }
    }

    // Primary check: same classroom overlap
    const classroomOverlap = await prisma.timetableSlot.findFirst({
      where: {
        academicYearId: Number(resolvedAcademicYearId),
        day,
        classroomId: Number(classroomId),
        NOT: {
          OR: [
            { endMinutes: { lte: startMinutes } },
            { startMinutes: { gte: endMinutes } },
          ],
        },
      },
    });

    if (classroomOverlap) {
      return sendError(
        res,
        409,
        "Time slot overlaps with existing slot in the same classroom",
      );
    }
    // === Optional but recommended: same teacher overlap ===
    if (teacherId) {
      const teacherOverlap = await prisma.timetableSlot.findFirst({
        where: {
          academicYearId: Number(resolvedAcademicYearId),
          day,
          teacherId: Number(teacherId),
          NOT: {
            OR: [
              { endMinutes: { lte: startMinutes } },
              { startMinutes: { gte: endMinutes } },
            ],
          },
        },
      });

      if (teacherOverlap) {
        return sendError(
          res,
          409,
          "Teacher is already assigned to another slot at the same time",
        );
      }
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
    perPage = 100,
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
        stream: {
          select: {
            id: true,
            name: true,
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
      skip,
      take: limit,
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

export const getMyStudentTimetable = async (req, res) => {
  const user = req.user;

  try {
    // 1. Determine target studentId
    let studentId;

    if (user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: user.id },
        select: { id: true, schoolId: true },
      });
      if (!student) return sendError(res, 404, "Student profile not found");
      if (user.schoolId && student.schoolId !== user.schoolId) {
        return sendError(res, 403, "Not authorized for this student");
      }
      studentId = student.id;
    } else if (user.role === "PARENT") {
      const actingStudentId = user.actingAsStudentId;
      if (!actingStudentId) {
        return sendError(res, 403, "No child selected", "CHILD_NOT_SELECTED");
      }
      studentId = actingStudentId;
      // Verify actingStudentId belongs to this parent (defense in depth)
      const link = await prisma.studentParent.findFirst({
        where: {
          parent: { userId: user.id },
          studentId: actingStudentId,
        },
        select: { student: { select: { schoolId: true } } },
      });

      if (!link) {
        return sendError(
          res,
          403,
          "Not authorized for this student",
          "FORBIDDEN",
        );
      }
      if (user.schoolId && link.student.schoolId !== user.schoolId) {
        return sendError(res, 403, "Not authorized for this student's school");
      }
    } else {
      return sendError(res, 403, "Only students or parents can access this");
    }

    // 2. Get active year
    const activeYear = await getActiveAcademicYear(user.schoolId);
    if (!activeYear) return sendError(res, 400, "No active academic year");

    // 3. Get student's current classroom/stream
    const enrollment = await prisma.studentStream.findFirst({
      where: {
        studentId,
        academicYearId: activeYear.id,
      },
      select: {
        classroomId: true,
        streamId: true,
        classroom: { select: { name: true, section: true } },
      },
    });

    if (!enrollment || !enrollment.classroomId) {
      return sendSuccess(
        res,
        200,
        {
          slots: [],
          groupedByDay: {},
          academicYear: activeYear.label,
          className: "Not enrolled",
        },
        "No active classroom enrollment found",
      );
    }

    // 4. Fetch timetable slots for this classroom/stream
    const slots = await prisma.timetableSlot.findMany({
      where: {
        academicYearId: activeYear.id,
        classroomId: enrollment.classroomId,
        OR: [{ streamId: null }, { streamId: enrollment.streamId }],
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, name: true } },
        stream: { select: { id: true, name: true } },
      },
      orderBy: [{ day: "asc" }, { startMinutes: "asc" }],
    });

    // Optional: Group by day for frontend calendar
    const groupedByDay = slots.reduce((acc, slot) => {
      const day = slot.day;
      if (!acc[day]) acc[day] = [];
      acc[day].push({
        time: `${Math.floor(slot.startMinutes / 60)
          .toString()
          .padStart(
            2,
            "0",
          )}:${(slot.startMinutes % 60).toString().padStart(2, "0")} - ${Math.floor(
          slot.endMinutes / 60,
        )
          .toString()
          .padStart(
            2,
            "0",
          )}:${(slot.endMinutes % 60).toString().padStart(2, "0")}`,
        subject: slot.subject?.name || "N/A",
        subjectCode: slot.subject?.code || "",
        teacher: slot.teacher?.name || "N/A",
        stream: slot.stream?.name || "Common",
      });
      return acc;
    }, {});

    return sendSuccess(
      res,
      200,
      {
        slots,
        groupedByDay,
        academicYear: activeYear.label,
        className: enrollment.classroom.name,
        section: enrollment.classroom.section,
        stream: enrollment.streamId ? enrollment.stream?.name : "Common",
      },
      "Your timetable fetched successfully",
    );
  } catch (err) {
    console.error("Get my timetable error:", err);
    return sendError(res, 500, "Failed to fetch timetable");
  }
};

export const getMyTeacherSlots = async (req, res) => {
  const user = req.user;

  try {
    if (!["STAFF", "TEACHER"].includes(user.role)) {
      return sendError(res, 403, "Only teachers can access this");
    }

    const teacher = await prisma.staff.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!teacher) return sendError(res, 404, "Teacher profile not found");

    const activeYear = await getActiveAcademicYear(user.schoolId);
    if (!activeYear) return sendError(res, 400, "No active academic year");

    const slots = await prisma.timetableSlot.findMany({
      where: {
        teacherId: teacher.id,
        academicYearId: activeYear.id,
      },
      include: {
        classroom: { select: { name: true, section: true } },
        subject: { select: { name: true, code: true } },
        stream: { select: { name: true } },
      },
      orderBy: [{ day: "asc" }, { startMinutes: "asc" }],
    });

    // Group by day for calendar view
    const groupedByDay = slots.reduce((acc, slot) => {
      const day = slot.day;
      if (!acc[day]) acc[day] = [];
      acc[day].push({
        time: `${Math.floor(slot.startMinutes / 60)
          .toString()
          .padStart(
            2,
            "0",
          )}:${(slot.startMinutes % 60).toString().padStart(2, "0")} - ${Math.floor(
          slot.endMinutes / 60,
        )
          .toString()
          .padStart(
            2,
            "0",
          )}:${(slot.endMinutes % 60).toString().padStart(2, "0")}`,
        class: slot.classroom?.name || "N/A",
        section: slot.classroom?.section || "",
        stream: slot.stream?.name || "",
        subject: slot.subject?.name || "N/A",
      });
      return acc;
    }, {});

    return sendSuccess(
      res,
      200,
      {
        slots,
        groupedByDay,
        academicYear: activeYear.label,
      },
      "Your teaching timetable fetched successfully",
    );
  } catch (err) {
    console.error("Get my teacher slots error:", err);
    return sendError(res, 500, "Failed to fetch timetable");
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
        return sendError(res, 400, "Invalid startTime format");
      }
      updates.startMinutes = sm;
    }

    if (updates.endTime) {
      const em = timeToMinutes(updates.endTime);
      if (em == null) {
        return sendError(res, 400, "Invalid endTime format");
      }
      updates.endMinutes = em;
    }

    delete updates.startTime;
    delete updates.endTime;

    if (updates.slotType && updates.slotType !== "CLASS") {
      if (updates.subjectId !== undefined) {
        return sendError(
          res,
          400,
          `subjectId should not be set for ${updates.slotType} slots`,
        );
      }
      if (updates.teacherId !== undefined) {
        return sendError(
          res,
          400,
          `teacherId should not be set for ${updates.slotType} slots`,
        );
      }
      updates.subjectId = null;
      updates.teacherId = null;
    } else if (updates.slotType === "CLASS") {
      // Optional: enforce subject or teacher required
      if (!updates.subjectId && !updates.teacherId) {
        return sendError(
          res,
          400,
          "CLASS slot requires subjectId or teacherId",
        );
      }
    }

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
      return sendError(res, 404, "Slot not found");
    }
    return sendError(res, 500, "Failed to update slot");
  }
};

export const deleteSlot = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.timetableSlot.delete({ where: { id: parseInt(id) } });
    return sendSuccess(res, 200, null, "Slot deleted successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") return sendError(res, 404, "Slot not found");
    return sendError(res, 500, "Failed to delete slot");
  }
};
