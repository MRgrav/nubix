import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendError, sendSuccess } from "./../utils/responseStructure.js";

export const createTeacherAssignment = async (req, res) => {
  const {
    teacherId,
    subjectId,
    classroomId,
    streamId,
    academicYearId,
    fromDate,
    toDate,
    status = "ACTIVE",
  } = req.body;

  try {
    // Validate required fields (teacher and subject always required)
    if (!teacherId || !subjectId) {
      return sendError(res, 400, "teacherId and subjectId are required");
    }

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) {
        return sendError(res, 400, "No active academic year found");
      }
      resolvedAcademicYearId = activeYear.id;
    }

    // Classroom validation
    let classroom = null;
    if (classroomId) {
      classroom = await prisma.classroom.findUnique({
        where: { id: parseInt(classroomId) },
        select: { id: true, name: true },
      });
      if (!classroom) {
        return sendError(res, 404, "Classroom not found");
      }
    }

    // Stream validation logic
    if (streamId && classroomId) {
      const classNumber = classroom.name.replace(/[^\d]/g, "");
      if (!["11", "12"].includes(classNumber)) {
        return sendError(
          res,
          400,
          "Stream assignments are only allowed for Class 11 and 12",
        );
      }
    } else if (streamId && !classroomId) {
      return sendError(res, 400, "Stream requires a classroom to be specified");
    }

    // Subject & Teacher validation
    const subject = await prisma.subject.findUnique({
      where: { id: parseInt(subjectId) },
      select: { id: true },
    });
    if (!subject) return sendError(res, 404, "Subject not found");

    const teacher = await prisma.staff.findUnique({
      where: { id: parseInt(teacherId) },
      select: { id: true },
    });
    if (!teacher) return sendError(res, 404, "Teacher not found");

    // Date validation
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      return sendError(res, 400, "fromDate must be before toDate");
    }

    // CRITICAL: Prevent duplicate assignment (same scope, handling optionals as null)
    const existingAssignment = await prisma.teacherAssignment.findFirst({
      where: {
        teacherId: parseInt(teacherId),
        subjectId: parseInt(subjectId),
        classroomId: classroomId ? parseInt(classroomId) : null,
        academicYearId: resolvedAcademicYearId,
        streamId: streamId ? parseInt(streamId) : null,
      },
    });

    if (existingAssignment) {
      return sendError(res, 409, "This assignment already exists", {
        message:
          "This teacher is already assigned to this subject, class, and academic year",
        existingAssignmentId: existingAssignment.id,
      });
    }

    // Overlap check — only if dates are provided
    if (fromDate || toDate) {
      const overlapConditions = [];

      if (fromDate) {
        overlapConditions.push({
          toDate: { gte: new Date(fromDate) }, // existing ends after new starts
        });
      }
      if (toDate) {
        overlapConditions.push({
          fromDate: { lte: new Date(toDate) }, // existing starts before new ends
        });
      }

      if (overlapConditions.length > 0) {
        const overlapping = await prisma.teacherAssignment.findFirst({
          where: {
            teacherId: parseInt(teacherId),
            academicYearId: resolvedAcademicYearId,
            status: { not: "COMPLETED" },
            OR: overlapConditions,
          },
        });

        if (overlapping) {
          return sendError(
            res,
            409,
            "Teacher already has an overlapping assignment in this period",
          );
        }
      }
    }

    // Create assignment (classroom and stream optional)
    const assignment = await prisma.teacherAssignment.create({
      data: {
        teacher: { connect: { id: parseInt(teacherId) } },
        subject: { connect: { id: parseInt(subjectId) } },
        ...(classroomId && {
          classroom: { connect: { id: parseInt(classroomId) } },
        }),
        ...(streamId && { stream: { connect: { id: parseInt(streamId) } } }),
        academicYear: { connect: { id: resolvedAcademicYearId } },
        fromDate: fromDate ? new Date(fromDate) : null,
        toDate: toDate ? new Date(toDate) : null,
        assignedBy: { connect: { id: req.user.id } },
      },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true, code: true } },
        classroom: { select: { id: true, name: true, section: true } },
        stream: true,
        academicYear: { select: { id: true, label: true } },
        assignedBy: { select: { id: true, role: true } },
      },
    });

    // Clean response with assignedBy name
    const response = {
      id: assignment.id,
      teacher: assignment.teacher,
      subject: assignment.subject,
      classroom: assignment.classroom,
      stream: assignment.stream,
      academicYear: assignment.academicYear,
      fromDate: assignment.fromDate,
      toDate: assignment.toDate,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      assignedBy: {
        id: assignment.assignedBy.id,
        role: assignment.assignedBy.role,
      },
    };

    return sendSuccess(
      res,
      201,
      response,
      "Teacher assignment created successfully",
    );
  } catch (err) {
    console.error("Create teacher assignment error:", err);

    if (err.code === "P2002") {
      return sendError(res, 409, "Duplicate assignment in this scope");
    }
    if (err.code === "P2025") {
      return sendError(
        res,
        404,
        "Teacher, subject, classroom or stream not found",
      );
    }

    return sendError(
      res,
      500,
      "Failed to create teacher assignment",
      err.message,
    );
  }
};

// GET All Teacher Assignments (with optional filters)
export const getTeacherAssignments = async (req, res) => {
  const {
    teacherId,
    classroomId,
    subjectId,
    streamId,
    academicYearId,
    status,
  } = req.query;

  try {
    let resolvedAcademicYearId = academicYearId
      ? parseInt(academicYearId)
      : (await getActiveAcademicYear())?.id;

    const where = {};
    if (resolvedAcademicYearId) where.academicYearId = resolvedAcademicYearId;
    if (teacherId) where.teacherId = parseInt(teacherId);
    if (classroomId) where.classroomId = parseInt(classroomId);
    if (subjectId) where.subjectId = parseInt(subjectId);
    if (streamId) where.streamId = parseInt(streamId);
    if (status) where.status = status;

    const assignments = await prisma.teacherAssignment.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true, code: true } },
        classroom: { select: { id: true, name: true, section: true } },
        stream: true,
        academicYear: { select: { id: true, label: true } },
        assignedBy: {
          select: { id: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return sendSuccess(
      res,
      200,
      { assignments },
      "Teacher assignments fetched",
    );
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to fetch teacher assignments",
      err.message,
    );
  }
};

export const getTeacherAssignment = async (req, res) => {
  const { id } = req.params;

  try {
    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true, code: true } },
        classroom: { select: { id: true, name: true, section: true } },
        stream: true,
        academicYear: { select: { id: true, label: true } },
        assignedBy: {
          select: { id: true, email: true, role: true },
        },
      },
    });

    if (!assignment) {
      return sendError(res, 404, "Assignment not found");
    }

    return sendSuccess(res, 200, assignment, "Teacher assignment fetched");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch assignment", err.message);
  }
};

// UPDATE Teacher Assignment (dates, status, stream)
export const updateTeacherAssignment = async (req, res) => {
  const { id } = req.params;
  const { fromDate, toDate, status, streamId, classroomId } = req.body;

  try {
    const data = {};
    if (fromDate) data.fromDate = new Date(fromDate);
    if (toDate) data.toDate = new Date(toDate);
    if (status) data.status = status;
    if (streamId !== undefined)
      data.stream = streamId
        ? { connect: { id: parseInt(streamId) } }
        : { disconnect: true };
    if (classroomId !== undefined)
      data.classroom = classroomId
        ? { connect: { id: parseInt(classroomId) } }
        : { disconnect: true };

    // Classroom + stream validation when updating
    if (classroomId) {
      const classroom = await prisma.classroom.findUnique({
        where: { id: parseInt(classroomId) },
        select: { id: true, name: true },
      });
      if (!classroom) {
        return sendError(res, 404, "Classroom not found");
      }
      if (streamId) {
        const classNumber = classroom.name.replace(/[^\d]/g, "");
        if (!["11", "12"].includes(classNumber)) {
          return sendError(
            res,
            400,
            "Stream assignments are only allowed for Class 11 and 12",
          );
        }
      }
    }

    const assignment = await prisma.teacherAssignment.update({
      where: { id: parseInt(id) },
      data,
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true, code: true } },
        classroom: { select: { id: true, name: true, section: true } },
        stream: true,
        assignedBy: {
          select: { id: true, email: true, role: true },
        },
        academicYear: { select: { id: true, label: true } },
      },
    });

    return sendSuccess(
      res,
      200,
      assignment,
      "Teacher assignment updated successfully",
    );
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Assignment not found");
    }
    return sendError(res, 500, "Failed to update assignment", err.message);
  }
};

export const deleteTeacherAssignment = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.teacherAssignment.delete({ where: { id: parseInt(id) } });
    return sendSuccess(
      res,
      200,
      { message: "Assignment deleted" },
      "Assignment deleted successfully",
    );
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Assignment not found");
    }
    return sendError(res, 500, "Failed to delete assignment", err.message);
  }
};

// Example: Check if teacher can enter marks
export const canTeacherEnterMarks = async (teacherId, examinationId) => {
  const exam = await prisma.examination.findUnique({
    where: { id: examinationId },
    include: { classroom: true, academicYear: true },
  });

  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId,
      subject: { name: exam.subject },
      classroomId: exam.classroomId,
      academicYearId: exam.academicYearId,
      status: "ACTIVE",
      OR: [{ fromDate: null }, { fromDate: { lte: new Date() } }],
      OR: [{ toDate: null }, { toDate: { gte: new Date() } }],
    },
  });

  return !!assignment;
};
