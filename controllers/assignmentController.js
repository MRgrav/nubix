import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";

export const createAssignment = async (req, res) => {
  const {
    title,
    description,
    fromDate,
    toDate,
    fileUrl,
    schoolId,
    academicYearId,
    targetClass,
    targetSection,
    streamId,
    classroomId,
  } = req.body;

  try {
    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(Number(schoolId));
      if (!activeYear) {
        return res.status(400).json({ error: "No active academic year found" });
      }
      resolvedAcademicYearId = activeYear.id;
    }

    // Stream allowed only for class 11–12
    if (streamId && !["11", "12"].includes(targetClass)) {
      return res.status(400).json({
        error: "Stream assignments are allowed only for class 11 and 12",
      });
    }

    const staff = req.user?.userId
      ? await prisma.staff.findUnique({ where: { userId: req.user.userId } })
      : null;

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        fileUrl,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),

        targetClass,
        targetSection,

        ...(streamId && {
          stream: { connect: { id: Number(streamId) } },
        }),

        school: { connect: { id: Number(schoolId) } },
        academicYear: { connect: { id: Number(resolvedAcademicYearId) } },

        ...(classroomId && {
          classroom: { connect: { id: Number(classroomId) } },
        }),

        ...(staff && {
          createdBy: { connect: { id: staff.id } },
        }),
      },
      include: {
        academicYear: { select: { id: true, label: true } },
        stream: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(assignment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create assignment" });
  }
};
export const getAssignments = async (req, res) => {
  const {
    page = 1,
    limit = 10,
    schoolId,
    academicYearId,
    targetClass,
    targetSection,
    streamId,
  } = req.query;

  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId && schoolId) {
      const activeYear = await getActiveAcademicYear(Number(schoolId));
      resolvedAcademicYearId = activeYear?.id;
    }

    const skip = (page - 1) * limit;

    const where = {
      schoolId: Number(schoolId),
      academicYearId: Number(resolvedAcademicYearId),
    };

    if (targetClass) where.targetClass = targetClass;
    if (targetSection) where.targetSection = targetSection;

    // STUDENT VISIBILITY
    if (req.user.role === "STUDENT") {
      const studentStream = await prisma.studentStream.findFirst({
        where: {
          studentId: req.user.studentId,
          academicYearId: Number(resolvedAcademicYearId),
        },
      });

      where.OR = [
        { streamId: null },
        ...(studentStream?.streamId
          ? [{ streamId: studentStream.streamId }]
          : []),
      ];
    }

    // ADMIN / STAFF explicit stream filter
    if (streamId) {
      where.streamId = Number(streamId);
    }

    const [total, assignments] = await prisma.$transaction([
      prisma.assignment.count({ where }),
      prisma.assignment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
        include: {
          academicYear: { select: { id: true, label: true } },
          stream: { select: { id: true, name: true } },
        },
      }),
    ]);

    res.json({
      assignments,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: Number(page),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch assignments" });
  }
};

export const getAssignment = async (req, res) => {
  const { id } = req.params;

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    res.json(assignment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch assignment" });
  }
};

export const updateAssignment = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    fromDate,
    toDate,
    fileUrl,
    targetClass,
    targetSection,
    academicYearId,
    streamId,
  } = req.body;

  try {
    const data = {
      title,
      description,
      targetClass,
      targetSection,
      ...(fromDate && { fromDate: new Date(fromDate) }),
      ...(toDate && { toDate: new Date(toDate) }),
      ...(fileUrl && { fileUrl }),
    };

    if (academicYearId) {
      data.academicYear = { connect: { id: Number(academicYearId) } };
    }

    if (streamId !== undefined) {
      data.stream = streamId
        ? { connect: { id: Number(streamId) } }
        : { disconnect: true };
    }

    const assignment = await prisma.assignment.update({
      where: { id: Number(id) },
      data,
      include: {
        academicYear: { select: { id: true, label: true } },
        stream: { select: { id: true, name: true } },
      },
    });

    res.json(assignment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update assignment" });
  }
};

export const deleteAssignment = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.assignment.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Assignment deleted successfully" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Assignment not found" });
    }
    res.status(500).json({ error: "Failed to delete assignment" });
  }
};
