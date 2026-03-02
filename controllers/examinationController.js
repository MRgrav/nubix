import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";

export const createExamination = async (req, res) => {
  const {
    title,
    description,
    subject,
    examDate,
    duration,
    totalMarks,
    schoolId,
    classroomId,
    academicYearId,
    markingSystem, // Added markingSystem
  } = req.body;
  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(parseInt(schoolId));
      if (!activeYear)
        return res.status(400).json({ error: "No active academic year" });
      resolvedAcademicYearId = activeYear.id;
    }

    const examination = await prisma.examination.create({
      data: {
        title,
        description,
        subject,
        examDate: new Date(examDate),
        duration,
        totalMarks,
        markingSystem: markingSystem || "MARKS", // Default to MARKS
        school: { connect: { id: parseInt(schoolId) } },
        classroom: { connect: { id: parseInt(classroomId) } },
        academicYear: { connect: { id: parseInt(resolvedAcademicYearId) } },
      },
      include: { school: true, classroom: true, academicYear: true },
    });
    res.status(201).json(examination);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create examination" });
  }
};

export const getExaminations = async (req, res) => {
  const { schoolId, classroomId, academicYearId, page = 1, limit = 10 } = req.query;

  try {
    let resolvedAcademicYearId = academicYearId;

    if (!resolvedAcademicYearId && schoolId) {
      const activeYear = await getActiveAcademicYear(parseInt(schoolId));
      resolvedAcademicYearId = activeYear?.id;
    }

    const where = {
      ...(resolvedAcademicYearId && {
        academicYearId: parseInt(resolvedAcademicYearId),
      }),
    };

    if (schoolId) where.schoolId = parseInt(schoolId);
    if (classroomId) where.classroomId = parseInt(classroomId);

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const [examinations, total] = await Promise.all([
      prisma.examination.findMany({
        where,
        include: {
          school: true,
          classroom: true,
          academicYear: true,
          results: true,
        },
        orderBy: { examDate: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.examination.count({ where }),
    ]);

    res.json({
      examinations,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch examinations" });
  }
};


export const getExamination = async (req, res) => {
  const { id } = req.params;
  try {
    const examination = await prisma.examination.findUnique({
      where: { id: parseInt(id) },
      include: {
        school: true,
        classroom: true,
        results: { include: { student: true } },
        academicYear: true,
      },
    });
    if (!examination)
      return res.status(404).json({ error: "Examination not found" });
    res.json(examination);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch examination" });
  }
};

export const updateExamination = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    if (updates.examDate) updates.examDate = new Date(updates.examDate);
    if (updates.academicYearId)
      updates.academicYear = {
        connect: { id: parseInt(updates.academicYearId) },
      };
    if (updates.schoolId)
      updates.school = { connect: { id: parseInt(updates.schoolId) } };
    if (updates.classroomId)
      updates.classroom = { connect: { id: parseInt(updates.classroomId) } };

    const examination = await prisma.examination.update({
      where: { id: parseInt(id) },
      data: updates,
      include: { academicYear: true },
    });
    res.json(examination);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Examination not found" });
    res.status(500).json({ error: "Failed to update examination" });
  }
};

export const deleteExamination = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.examination.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Examination deleted" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Examination not found" });
    res.status(500).json({ error: "Failed to delete examination" });
  }
};

export const addExaminationResult = async (req, res) => {
  const { examinationId, studentId, marksObtained, grade, remarks, academicYearId } =
    req.body;
  const { userId, role } = req.user; // Assuming req.user is populated by authenticate middleware

  try {
    const exam = await prisma.examination.findUnique({
      where: { id: parseInt(examinationId) },
      include: { permissions: true }
    });

    if (!exam) return res.status(404).json({ error: "Examination not found" });

    // Check permission
    if (role === "STAFF") {
      const staff = await prisma.staff.findUnique({
        where: { userId: userId }
      });

      if (!staff) return res.status(403).json({ error: "Staff record not found" });

      const hasPermission = exam.permissions.some(
        p => p.staffId === staff.id && p.canAddMarks
      );

      if (!hasPermission) {
        return res.status(403).json({ 
          error: "You do not have permission to add marks for this examination. Please contact admin." 
        });
      }
    } else if (role !== "ADMIN") {
      return res.status(403).json({ error: "Only admin and authorized staff can add results" });
    }

    // Validate based on marking system
    if (exam.markingSystem === "MARKS" && marksObtained === undefined) {
      return res.status(400).json({ error: "marksObtained is required for this examination" });
    }
    if (exam.markingSystem === "GRADE" && !grade) {
      return res.status(400).json({ error: "grade is required for this examination" });
    }

    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      resolvedAcademicYearId = exam.academicYearId;
    }

    const result = await prisma.examinationResult.create({
      data: {
        marksObtained: marksObtained !== undefined ? parseFloat(marksObtained) : null,
        grade: grade || null,
        remarks,
        examination: { connect: { id: parseInt(examinationId) } },
        student: { connect: { id: parseInt(studentId) } },
        academicYear: { connect: { id: parseInt(resolvedAcademicYearId) } },
      },
      include: { examination: true, student: true, academicYear: true },
    });
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    if (err.code === "P2002")
      return res.status(400).json({ error: "Result already exists" });
    res.status(500).json({ error: "Failed to add result" });
  }
};

/**
 * Grant or revoke examination permission for a staff member
 */
export const updateExaminationPermission = async (req, res) => {
  const { examinationId, staffId, canAddMarks } = req.body;
  
  // Only ADMIN can manage permissions
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Only admins can manage examination permissions" });
  }

  try {
    const permission = await prisma.examinationPermission.upsert({
      where: {
        examinationId_staffId: {
          examinationId: parseInt(examinationId),
          staffId: parseInt(staffId)
        }
      },
      update: {
        canAddMarks: !!canAddMarks
      },
      create: {
        examinationId: parseInt(examinationId),
        staffId: parseInt(staffId),
        canAddMarks: !!canAddMarks
      }
    });

    res.json({ message: "Permission updated successfully", permission });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update permission" });
  }
};

/**
 * Get all permissions for a specific examination
 */
export const getExaminationPermissions = async (req, res) => {
  const { examinationId } = req.params;
  
  try {
    const permissions = await prisma.examinationPermission.findMany({
      where: { examinationId: parseInt(examinationId) },
      include: {
        staff: {
          select: { id: true, name: true, employeeId: true, role: true }
        }
      }
    });
    res.json({ permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch permissions" });
  }
};

export const getStudentExaminationResults = async (req, res) => {
  const { studentId } = req.params;
  const { academicYearId } = req.query;
  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      resolvedAcademicYearId = activeYear?.id;
    }

    const results = await prisma.examinationResult.findMany({
      where: {
        studentId: parseInt(studentId),
        ...(resolvedAcademicYearId && {
          academicYearId: parseInt(resolvedAcademicYearId),
        }),
      },
      include: { examination: true, student: true, academicYear: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch student results" });
  }
};

export const getExaminationResult = async (req, res) => {
  const { resultId } = req.params;
  try {
    const result = await prisma.examinationResult.findUnique({
      where: { id: parseInt(resultId) },
      include: { examination: true, student: true },
    });
    if (!result) return res.status(404).json({ error: "Result not found" });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch result" });
  }
};

export const deleteExaminationResult = async (req, res) => {
  const { resultId } = req.params;
  try {
    await prisma.examinationResult.delete({
      where: { id: parseInt(resultId) },
    });
    res.json({ message: "Result deleted" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Result not found" });
    res.status(500).json({ error: "Failed to delete result" });
  }
};

export const getExaminationStats = async (req, res) => {
  const { examinationId } = req.params;
  try {
    const stats = await prisma.examinationResult.groupBy({
      by: ["marksObtained"],
      where: { examinationId: parseInt(examinationId) },
      _count: { marksObtained: true },
    });
    res.json({ stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};
