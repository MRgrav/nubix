import prisma from "../models/prisma.js";

import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { generateRollNo } from "../utils/rollNoGenerator.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";

export const createClassroom = async (req, res) => {
  try {
    const {
      name,
      schoolId,
      section = "A",
      isSubjectWiseAttendance = false,
    } = req.body;

    if (!name || !schoolId) {
      return sendError(res, 400, "Name ans SchoolId are required", "NOT_FOUND");
    }

    // Check if classroom with same name + section + school already exists
    const existingClass = await prisma.classroom.findFirst({
      where: {
        name,
        section: section?.toUpperCase() || "A",
        schoolId: parseInt(schoolId),
      },
    });

    if (existingClass) {
      return sendError(
        res,
        409,
        `Class "${name} ${section || "A"}" already exists in this school`,
        "CONFLICT_ERROR",
      );
    }

    const classroom = await prisma.classroom.create({
      data: {
        name: name.trim(),
        section: (section || "A").trim().toUpperCase(),
        isSubjectWiseAttendance: Boolean(isSubjectWiseAttendance),
        school: { connect: { id: parseInt(schoolId) } },
      },
      include: {
        school: {
          select: { id: true, name: true, schoolCode: true },
        },
      },
    });
    return sendSuccess(res, 201, classroom, "Classromm Created Successfully");
  } catch (err) {
    console.log(err);
    return sendError(res, 500, "Failed to create Classroom", "INTERNAL_ERROR");
  }
};

export const getClassrooms = async (req, res) => {
  const { schoolId, page = 1, limit = 60 } = req.query;
  try {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = schoolId ? { schoolId: parseInt(schoolId) } : {};

    const total = await prisma.classroom.count({ where });
    const classrooms = await prisma.classroom.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        students: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });

    const totalPages = Math.ceil(total / limitNum);
    return sendSuccess(
      res,
      200,
      classrooms,
      "Classroom Details Fetched Successfully",
      {
        pagination: {
          total,
          totalPages,
          currentPage: pageNum,
          perPage: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },
    );
  } catch (err) {
    console.error("Get classrooms error:", err);
    return sendError(res, 500, "Failed to fetch classrooms", "INTERNAL_ERROR");
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
    return sendSuccess(res, 200, classroom, "Class");
  } catch (err) {
    console.error("Get classroom error:", err);
    return sendError(res, 500, "Failed to fetch classroom", "INTERNAL_ERROR");
  }
};

// APP API for class name,id,section
export const getClassesDropdown = async (req, res) => {
  const { search, limit = 100 } = req.query;

  try {
    const schoolId = req.user.schoolId;

    if (!schoolId) {
      return sendError(res, 400, "School context missing", "VALIDATION_ERROR");
    }

    const where = {
      schoolId: Number(schoolId),
    };

    // Optional search: name or section
    if (search?.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { section: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    const classrooms = await prisma.classroom.findMany({
      where,
      select: {
        id: true,
        name: true,
        section: true,
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
      take: Math.min(Number(limit), 200), // cap at 200 for safety
    });

    // Format for dropdown (optional displayName for easy frontend use)
    const formatted = classrooms.map((cls) => ({
      id: cls.id,
      name: cls.name,
      section: cls.section || null,
      displayName: cls.section ? `${cls.name} - ${cls.section}` : cls.name,
    }));

    return sendSuccess(res, 200, formatted, "Classes fetched for dropdown", {
      total: formatted.length,
    });
  } catch (err) {
    console.error("Get classes dropdown error:", err);
    return sendError(res, 500, "Failed to fetch classes", "INTERNAL_ERROR");
  }
};

// Public: Get classes dropdown (no auth required)
export const getClassesDropdownPublic = async (req, res) => {
  const { search, limit = 100, schoolId } = req.query;

  try {
    // schoolId is now REQUIRED in query (public callers must provide it)
    if (!schoolId) {
      return sendError(res, 400, "schoolId is required", "VALIDATION_ERROR");
    }

    const parsedSchoolId = Number(schoolId);
    if (isNaN(parsedSchoolId) || parsedSchoolId <= 0) {
      return sendError(res, 400, "Invalid schoolId", "VALIDATION_ERROR");
    }

    const where = {
      schoolId: parsedSchoolId,
      // Optional: only show active classrooms if you have such a field
      // isActive: true,
    };

    // Optional search: name or section
    if (search?.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { section: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    const classrooms = await prisma.classroom.findMany({
      where,
      select: {
        id: true,
        name: true,
        section: true,
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
      take: Math.min(Number(limit), 200), // hard cap for safety
    });

    // Format for dropdown
    const formatted = classrooms.map((cls) => ({
      id: cls.id,
      name: cls.name,
      section: cls.section || null,
      displayName: cls.section ? `${cls.name} - ${cls.section}` : cls.name,
    }));

    return sendSuccess(res, 200, formatted, "Classes fetched for dropdown", {
      total: formatted.length,
    });
  } catch (err) {
    console.error("Public get classes dropdown error:", err);
    return sendError(res, 500, "Failed to fetch classes", "INTERNAL_ERROR");
  }
};

// UPDATE CLASSROOM
export const updateClassroom = async (req, res) => {
  const { id } = req.params;
  const { name, section, schoolId } = req.body;

  try {
    const classroomId = parseInt(id);
    if (isNaN(classroomId)) {
      return sendError(res, 400, "Invalid classroom ID", "INVALID_ID");
    }

    const existing = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, name: true, section: true, schoolId: true },
    });

    if (!existing) {
      return sendError(res, 404, "Classroom not found", "NOT_FOUND");
    }

    const data = {};
    if (name) data.name = name.trim();
    if (section) data.section = section.trim().toUpperCase();
    if (schoolId) data.school = { connect: { id: parseInt(schoolId) } };
    if (req.body.isSubjectWiseAttendance !== undefined) {
      data.isSubjectWiseAttendance = Boolean(req.body.isSubjectWiseAttendance);
    }

    // Prevent duplicate name + section in same school
    if (data.name || data.section) {
      const existing = await prisma.classroom.findFirst({
        where: {
          name: data.name || undefined,
          section: data.section || undefined,
          schoolId: schoolId ? parseInt(schoolId) : undefined,
          NOT: { id: parseInt(id) },
        },
      });

      if (existing) {
        return sendError(
          res,
          409,
          `Class "${data.name || name} ${
            data.section || section
          }" already exists`,
        );
      }
    }

    const classroom = await prisma.classroom.update({
      where: { id: parseInt(id) },
      data,
      include: { school: { select: { id: true, name: true } } },
    });

    return sendSuccess(res, 200, classroom, "Classroom Updated Successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Classroom Not Found", "NOT_FOUND");
    }
    sendError(res, 500, "Failed to update classroom", "INTERNAL_ERROR");
  }
};

export const deleteClassroom = async (req, res) => {
  const { id } = req.params;
  try {
    const classroomId = parseInt(id);
    if (isNaN(classroomId)) {
      return sendError(res, 400, "Invalid classroom ID", "INVALID_ID");
    }
    // Fetch classroom to validate existence + school ownership
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        name: true,
        section: true,
        schoolId: true,
      },
    });

    if (!classroom) {
      return sendError(res, 404, "Classroom not found", "NOT_FOUND");
    }

    const studentCount = await prisma.student.count({
      where: { classroomId },
    });

    if (studentCount > 0) {
      return sendError(
        res,
        409,
        `Cannot delete classroom "${classroom.name} ${classroom.section || ""}" — ${studentCount} student(s) are still enrolled`,
        "CONFLICT",
        { studentCount },
      );
    }

    // Safe to delete — no students
    await prisma.classroom.delete({
      where: { id: classroomId },
    });

    return sendSuccess(res, 200, null, "Classroom deleted successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") return sendError(res, 404, "Classroom Not Found");
    return sendError(res, 500, "Failed to delete class", "INTERNAL_ERROR");
  }
};

// Assign/Remove students to class
export const addStudentToClass = async (req, res) => {
  const { classId } = req.params;
  const { studentId, forceTransfer = false } = req.body;

  try {
    if (!studentId) {
      return sendError(res, 400, "studentId is required", "VALIDATION_ERROR");
    }
    // Validate classroom exists
    const targetClassroom = await prisma.classroom.findUnique({
      where: { id: parseInt(classId) },
      select: { id: true, name: true, section: true, schoolId: true },
    });

    if (!targetClassroom) {
      return sendError(res, 404, "Classroom not found", "NOT_FOUND");
    }
    // Get student with current enrollment
    const student = await prisma.student.findUnique({
      where: { id: parseInt(studentId) },
      include: { classroom: true },
    });

    if (!student) {
      return sendError(res, 404, "Student not found", "NOT_FOUND");
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
  const { page = 1, limit = 60, search } = req.query;

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
          user: {
            select: {
              id: true,
              email: true,
            },
          },
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

/**
 * Set subject-wise attendance requirement for a class (Admin only)
 * PUT /api/classes/:id/subject-wise-attendance
 * Body: { isSubjectWiseAttendance: true/false }
 */
export const setSubjectWiseAttendance = async (req, res) => {
  const { id } = req.params;
  const { isSubjectWiseAttendance } = req.body;

  if (typeof isSubjectWiseAttendance !== "boolean") {
    return res.status(400).json({
      error: "isSubjectWiseAttendance must be a boolean (true or false)",
    });
  }

  try {
    // Check if classroom exists
    const classroom = await prisma.classroom.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        section: true,
        isSubjectWiseAttendance: true,
        school: {
          select: { id: true, name: true, schoolCode: true },
        },
      },
    });

    if (!classroom) {
      return res.status(404).json({ error: "Classroom not found" });
    }

    // Update the subject-wise attendance setting
    const updated = await prisma.classroom.update({
      where: { id: parseInt(id) },
      data: { isSubjectWiseAttendance },
      include: {
        school: {
          select: { id: true, name: true, schoolCode: true },
        },
        _count: {
          select: { students: true },
        },
      },
    });

    res.json({
      message: `Subject-wise attendance ${isSubjectWiseAttendance ? "enabled" : "disabled"} for ${updated.name} ${updated.section}`,
      classroom: updated,
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Classroom not found" });
    }
    res
      .status(500)
      .json({ error: "Failed to update subject-wise attendance setting" });
  }
};

/**
 * Get all classes with their subject-wise attendance settings
 * GET /api/classes/subject-wise-attendance?schoolId=1
 */
export const getClassesSubjectWiseSettings = async (req, res) => {
  const { schoolId } = req.query;

  try {
    const where = schoolId ? { schoolId: parseInt(schoolId) } : {};

    const classrooms = await prisma.classroom.findMany({
      where,
      select: {
        id: true,
        name: true,
        section: true,
        isSubjectWiseAttendance: true,
        school: {
          select: { id: true, name: true, schoolCode: true },
        },
        _count: {
          select: { students: true },
        },
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });

    // Group by subject-wise setting
    const withSubjectWise = classrooms.filter((c) => c.isSubjectWiseAttendance);
    const withoutSubjectWise = classrooms.filter(
      (c) => !c.isSubjectWiseAttendance,
    );

    res.json({
      total: classrooms.length,
      withSubjectWise: {
        count: withSubjectWise.length,
        classes: withSubjectWise,
      },
      withoutSubjectWise: {
        count: withoutSubjectWise.length,
        classes: withoutSubjectWise,
      },
      all: classrooms,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to fetch classes subject-wise settings" });
  }
};
