import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";

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
      return res
        .status(400)
        .json({ error: "teacherId and subjectId are required" });
    }

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) {
        return res.status(400).json({ error: "No active academic year found" });
      }
      resolvedAcademicYearId = activeYear.id;
    }

    // Optional: Fetch classroom for validation if provided
    let classroom = null;
    if (classroomId) {
      classroom = await prisma.classroom.findUnique({
        where: { id: parseInt(classroomId) },
        select: { id: true, name: true },
      });

      if (!classroom) {
        return res.status(404).json({ error: "Classroom not found" });
      }
    }

    // Optional: Stream validation (only if classroom is provided and for class 11 or 12)
    if (streamId && classroomId) {
      const classNumber = classroom.name.replace(/[^\d]/g, "");
      if (!["11", "12"].includes(classNumber)) {
        return res.status(400).json({
          error: "Stream assignments are only allowed for Class 11 and 12",
        });
      }
    } else if (streamId && !classroomId) {
      return res
        .status(400)
        .json({ error: "Stream requires a classroom to be specified" });
    }

    // Subject Validation
    const subject = await prisma.subject.findUnique({
      where: { id: parseInt(subjectId) },
      select: { id: true },
    });
    if (!subject) return res.status(404).json({ error: "Subject not found" });

    // Teacher Validation
    const teacher = await prisma.staff.findUnique({
      where: { id: parseInt(teacherId) },
      select: { id: true },
    });
    if (!teacher) return res.status(404).json({ error: "Teacher not found" });

    // Date validation
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      return res.status(400).json({ error: "fromDate must be before toDate" });
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
      return res.status(409).json({
        error: "This assignment already exists",
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
          return res.status(409).json({
            error:
              "Teacher already has an overlapping assignment in this period",
          });
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

    res.status(201).json(response);
  } catch (err) {
    console.error("Create teacher assignment error:", err);
    if (err.code === "P2002") {
      return res
        .status(400)
        .json({ error: "Duplicate assignment in this scope" });
    }
    if (err.code === "P2025") {
      return res
        .status(404)
        .json({ error: "Teacher, subject, or classroom not found" });
    }
    res.status(500).json({ error: "Failed to create teacher assignment" });
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
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      resolvedAcademicYearId = activeYear?.id;
    }

    const where = {};
    if (resolvedAcademicYearId)
      where.academicYearId = parseInt(resolvedAcademicYearId);
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

    res.json({ assignments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch assignments" });
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
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });
    res.json(assignment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch assignment" });
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

    // If adding classroom, validate stream if applicable
    if (classroomId) {
      const classroom = await prisma.classroom.findUnique({
        where: { id: parseInt(classroomId) },
        select: { id: true, name: true },
      });
      if (!classroom) {
        return res.status(404).json({ error: "Classroom not found" });
      }
      if (streamId) {
        const classNumber = classroom.name.replace(/[^\d]/g, "");
        if (!["11", "12"].includes(classNumber)) {
          return res.status(400).json({
            error: "Stream assignments are only allowed for Class 11 and 12",
          });
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
    res.json(assignment);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Assignment not found" });
    res.status(500).json({ error: "Failed to update assignment" });
  }
};

export const deleteTeacherAssignment = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.teacherAssignment.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Assignment deleted" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Assignment not found" });
    res.status(500).json({ error: "Failed to delete assignment" });
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
