import prisma from "../models/prisma.js";

import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { generateRollNo } from "../utils/rollNoGenerator.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";

export const createClassroom = async (req, res) => {
  const { name, schoolId, section } = req.body;

  if (!name || !schoolId) {
    return res.status(400).json({
      error: "name and schoolId are required",
    });
  }
  try {
    // Check if classroom with same name + section + school already exists
    const existingClass = await prisma.classroom.findFirst({
      where: {
        name,
        section: section?.toUpperCase() || "A",
        schoolId: parseInt(schoolId),
      },
    });

    if (existingClass) {
      return res.status(409).json({
        error: `Class "${name} ${
          section || "A"
        }" already exists in this school`,
      });
    }

    const classroom = await prisma.classroom.create({
      data: {
        name: name.trim(),
        section: (section || "A").trim().toUpperCase(),
        school: { connect: { id: parseInt(schoolId) } },
      },
      include: {
        school: {
          select: { id: true, name: true, schoolCode: true },
        },
      },
    });
    res.status(201).json(classroom);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to create class" });
  }
};

export const getClassrooms = async (req, res) => {
  const { schoolId } = req.query;
  try {
    const where = schoolId ? { schoolId: parseInt(schoolId) } : {};
    const classrooms = await prisma.classroom.findMany({
      where,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        students: { select: { id: true, name: true } },
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });
    res.json({ classrooms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch classes" });
  }
};

export const getClassroom = async (req, res) => {
  const { id } = req.params;
  try {
    const classroom = await prisma.classroom.findUnique({
      where: { id: parseInt(id) },
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        students: true,
        timetableSlots: {
          include: {
            subject: true,
            teacher: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!classroom) return res.status(404).json({ error: "Class not found" });
    res.json(classroom);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch class" });
  }
};

// UPDATE CLASSROOM
export const updateClassroom = async (req, res) => {
  const { id } = req.params;
  const { name, section, schoolId } = req.body;

  try {
    const data = {};
    if (name) data.name = name.trim();
    if (section) data.section = section.trim().toUpperCase();
    if (schoolId) data.school = { connect: { id: parseInt(schoolId) } };

    // Prevent duplicate name + section in same school
    if (name || section) {
      const existing = await prisma.classroom.findFirst({
        where: {
          name: data.name || undefined,
          section: data.section || undefined,
          schoolId: schoolId ? parseInt(schoolId) : undefined,
          NOT: { id: parseInt(id) },
        },
      });

      if (existing) {
        return res.status(409).json({
          error: `Class "${data.name || name} ${
            data.section || section
          }" already exists`,
        });
      }
    }

    const classroom = await prisma.classroom.update({
      where: { id: parseInt(id) },
      data,
      include: { school: { select: { id: true, name: true } } },
    });

    res.json(classroom);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Classroom not found" });
    }
    res.status(500).json({ error: "Failed to update classroom" });
  }
};

export const deleteClassroom = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.classroom.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Classroom deleted successfully" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Class not found" });
    res.status(500).json({ error: "Failed to delete class" });
  }
};

// Assign/Remove students to class
export const addStudentToClass = async (req, res) => {
  const { classId } = req.params;
  const { studentId, forceTransfer = false } = req.body;

  if (!studentId) {
    return res.status(400).json({ error: "studentId is required" });
  }

  try {
    // Validate classroom exists
    const targetClassroom = await prisma.classroom.findUnique({
      where: { id: parseInt(classId) },
      select: { id: true, name: true, section: true, schoolId: true },
    });

    if (!targetClassroom) {
      return res.status(404).json({ error: `Classroom ${classId} not found` });
    }

    // Get student with current enrollment
    const student = await prisma.student.findUnique({
      where: { id: parseInt(studentId) },
      include: { classroom: true },
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check if already in the target class
    if (student.classroomId === parseInt(classId)) {
      return res.status(409).json({
        error: "Student is already enrolled in this class",
        currentClass: `Class: ${student.classroom.name} , Section : ${student.classroom.section}`,
      });
    }

    //  If student is in another class → warn or block
    if (student.classroomId && !forceTransfer) {
      return res.status(409).json({
        error: "Student is already assigned to another class",
        currentClassroom: {
          id: student.classroomId,
          name: student.classroom.name,
          section: student.classroom.section,
        },
        targetClassroom: {
          id: targetClassroom.id,
          name: targetClassroom.name,
          section: targetClassroom.section,
        },
        note: "FrontEnd Dev: Use 'forceTransfer: true' in request body to move the student",
      });
    }

    // Get active academic year
    const activeYear = await getActiveAcademicYear();
    if (!activeYear) {
      return res.status(400).json({ error: "No active academic year found" });
    }

    // Generate roll number (for Class 1–10)
    const rollNo = await generateRollNo(prisma, {
      academicYearId: activeYear.id,
      classroomId: parseInt(classId),
      streamId: null, // no stream for lower classes
      schoolId: targetClassroom.schoolId,
    });

    // Create or update StudentStream entry
    const enrollment = await prisma.studentStream.upsert({
      where: {
        academicYearId_studentId: {
          academicYearId: activeYear.id,
          studentId: parseInt(studentId),
        },
      },
      update: {
        classroom: { connect: { id: parseInt(classId) } },
        rollNo,
        stream: { disconnect: true }, // clear any old stream
      },
      create: {
        student: { connect: { id: parseInt(studentId) } },
        classroom: { connect: { id: parseInt(classId) } },
        academicYear: { connect: { id: activeYear.id } },
        rollNo,
      },
      include: {
        classroom: { select: { id: true, name: true, section: true } },
        academicYear: { select: { id: true, label: true, isActive: true } },
      },
    });

    // Update student's direct classroomId
    await prisma.student.update({
      where: { id: parseInt(studentId) },
      data: { classroom: { connect: { id: parseInt(classId) } } },
    });

    const action = student.classroomId ? "transferred" : "assigned";

    res.json({
      message: `Student successfully ${action} to class with roll number`,
      rollNo,
      enrollment,
      student: {
        id: student.id,
        name: student.name,
        previousClassroomId: student.classroomId,
        newClassroomId: parseInt(classId),
      },
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Student or classroom not found" });
    }
    res.status(500).json({ error: "Failed to assign student to class" });
  }
};

export const removeStudentFromClass = async (req, res) => {
  const { classId } = req.params;
  const { studentId } = req.body;

  if (!studentId) {
    return res
      .status(400)
      .json({ error: "studentId is required in request body" });
  }

  try {
    //  First verify the classroom exists
    const classroom = await prisma.classroom.findUnique({
      where: { id: parseInt(classId) },
      select: { id: true },
    });

    if (!classroom) {
      return res
        .status(404)
        .json({ error: `Classroom with ID ${classId} not found` });
    }

    // Check if the student is currently enrolled in this class
    const student = await prisma.student.findFirst({
      where: {
        id: parseInt(studentId),
        classroomId: parseInt(classId),
      },
      include: { classroom: true },
    });

    if (!student) {
      return res.status(404).json({
        error: "Student is not enrolled in this class",
        note: "Nothing to remove",
        studentId: parseInt(studentId),
        classroomId: parseInt(classId),
      });
    }

    // 3. Now safely disconnect
    const updatedStudent = await prisma.student.update({
      where: { id: parseInt(studentId) },
      data: { classroom: { disconnect: true } },
      include: {
        classroom: true,
        school: { select: { id: true, name: true } },
      },
    });

    return res.json({
      message: "Student successfully removed from class",
      student: {
        id: updatedStudent.id,
        name: updatedStudent.name,
        previousClassroomId: parseInt(classId),
        currentClassroom: updatedStudent.classroom,
      },
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Student not found" });
    }

    res.status(500).json({ error: "Failed to remove student from class" });
  }
};

export const getClassTeachers = async (req, res) => {
  const { id } = req.params; // classroomId
  const { academicYear } = req.query; // e.g., "2025-2026"

  try {
    // 1. First check if the classroom actually exists
    const classroomExists = await prisma.classroom.findUnique({
      where: { id: parseInt(id) },
      select: { id: true },
    });

    if (!classroomExists) {
      return res.status(404).json({
        error: `Classroom with ID ${id} not found`,
      });
    }
    let academicYearId = null;

    if (academicYear) {
      const ay = await prisma.academicYear.findUnique({
        where: { label: academicYear },
        select: { id: true },
      });

      if (!ay) {
        return res
          .status(400)
          .json({ error: `Academic year "${academicYear}" not found` });
      }
      academicYearId = ay.id;
    } else {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) {
        return res.status(400).json({ error: "No active academic year found" });
      }
      academicYearId = activeYear.id;
    }

    const slots = await prisma.timetableSlot.findMany({
      where: {
        classroomId: parseInt(id),
        academicYearId: academicYearId,
        teacherId: { not: null },
      },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        academicYear: {
          select: { id: true, label: true },
        },
      },
      orderBy: [{ day: "asc" }, { startMinutes: "asc" }],
    });

    // Extract unique teachers with subjects
    const uniqueTeachers = [];
    const seen = new Set();

    for (const slot of slots) {
      if (slot.teacher && !seen.has(slot.teacher.id)) {
        seen.add(slot.teacher.id);
        uniqueTeachers.push({
          ...slot.teacher,
          subjects: slot.subject
            ? [
                {
                  id: slot.subject.id,
                  name: slot.subject.name,
                  code: slot.subject.code,
                },
              ]
            : [],
        });
      } else if (slot.teacher && seen.has(slot.teacher.id)) {
        const existing = uniqueTeachers.find((t) => t.id === slot.teacher.id);
        if (existing && slot.subject) {
          const hasSubject = existing.subjects.some(
            (s) => s.id === slot.subject.id,
          );
          if (!hasSubject) {
            existing.subjects.push({
              id: slot.subject.id,
              name: slot.subject.name,
              code: slot.subject.code,
            });
          }
        }
      }
    }

    res.json({
      classroomId: parseInt(id),
      academicYear: academicYear || "current active",
      teachers: uniqueTeachers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch class teachers" });
  }
};

export const getClassSubjects = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicYear } = req.query;
    const where = {
      classroomId: parseInt(id, 10),
      ...(req.user?.schoolId ? { schoolId: req.user.schoolId } : {}),
      ...(academicYear ? { academicYear } : {}),
    };
    const slots = await prisma.timetableSlot.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true, code: true } },
      },
    });
    const subjectsMap = new Map();
    for (const s of slots) {
      if (s.subject) {
        subjectsMap.set(s.subject.id, s.subject);
      }
    }
    res.json({ subjects: Array.from(subjectsMap.values()) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch class subjects" });
  }
};

export const getStudentsInClass = async (req, res) => {
  console.log("=== DEBUG: getStudentsInClass started ===");
  console.log("User role:", req.user.role);
  console.log("User ID:", req.user.id);
  console.log("Requested classId:", req.params.classId);
  console.log("Query params:", req.query);

  // FIXED ROLE CHECK
  if (!["STAFF", "ADMIN"].includes(req.user.role)) {
    console.log("Role check failed - not STAFF or ADMIN");
    return sendError(
      res,
      403,
      "Only staff or admin can fetch class students",
      "FORBIDDEN",
    );
  }

  const { classId } = req.params;
  const { page = 1, limit = 10, search } = req.query;

  try {
    console.log(
      "Checking assignment for teacherId:",
      req.user.id,
      "classroomId:",
      parseInt(classId),
    );

    // Check if teacher is assigned to this class
    const assignment = await prisma.teacherAssignment.findFirst({
      where: {
        teacherId: req.user.staff?.id,
        classroomId: parseInt(classId),
      },
      include: {
        subject: { select: { name: true } },
        academicYear: { select: { label: true } },
      },
    });

    if (!assignment) {
      console.log("No assignment found for this teacher and class");
      return sendError(
        res,
        403,
        "You are not assigned to this class",
        "FORBIDDEN",
      );
    }

    console.log("Assignment found:", {
      id: assignment.id,
      subject: assignment.subject?.name,
      academicYear: assignment.academicYear?.label,
      status: assignment.status,
    });

    // Build query
    const where = { classroomId: parseInt(classId) };
    if (search?.trim()) {
      where.name = { contains: search.trim(), mode: "insensitive" };
      console.log("Search filter applied:", search.trim());
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    console.log("Query params:", { where, skip, take });

    const [total, students] = await prisma.$transaction([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          grade: true,
        },
      }),
    ]);

    console.log("Found students count:", total);
    console.log("Students data sample:", students.slice(0, 2)); // First 2 for debug

    return sendSuccess(res, 200, students, "Students fetched successfully", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error("Get students in class error:", err);
    return sendError(res, 500, "Failed to fetch students", "INTERNAL_ERROR");
  } finally {
    console.log("=== DEBUG: getStudentsInClass ended ===");
  }
};
