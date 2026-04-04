import prisma from "../models/prisma.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";

// ==================== CREATE SUBJECT ====================
export const createSubject = async (req, res) => {
  try {
    const { name, code, description, schoolId } = req.body;

    if (!name?.trim() || !code?.trim()) {
      return sendError(
        res,
        400,
        "Name and code are required",
        "VALIDATION_ERROR",
      );
    }

    const finalSchoolId = schoolId || req.user?.schoolId;
    if (!finalSchoolId) {
      return sendError(res, 400, "School ID is required", "VALIDATION_ERROR");
    }

    // Check if school exists and user has access
    const school = await prisma.school.findUnique({
      where: { id: Number(finalSchoolId) },
    });

    if (!school) {
      return sendError(res, 404, "School not found", "NOT_FOUND");
    }

    // Optional: Check if user belongs to this school (for non-super-admin)
    if (req.user.schoolId && req.user.schoolId !== Number(finalSchoolId)) {
      return sendError(
        res,
        403,
        "You can only create subjects for your school",
        "FORBIDDEN",
      );
    }

    const subject = await prisma.subject.create({
      data: {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description?.trim() || null,
        schoolId: Number(finalSchoolId),
      },
      include: {
        school: { select: { id: true, name: true } },
      },
    });

    return sendSuccess(res, 201, subject, "Subject created successfully");
  } catch (err) {
    console.error("Create subject error:", err);

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Subject code already exists",
        "DUPLICATE_CODE",
      );
    }

    return sendError(res, 500, "Failed to create subject", "INTERNAL_ERROR");
  }
};

// ==================== GET ALL SUBJECTS (with pagination) ====================
export const getSubjects = async (req, res) => {
  try {
    const { schoolId, page = 1, limit = 100 } = req.query;

    const where = {};
    if (schoolId) where.schoolId = Number(schoolId);
    // If user is not super admin, restrict to their school
    else if (req.user?.schoolId) where.schoolId = req.user.schoolId;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, subjects] = await prisma.$transaction([
      prisma.subject.count({ where }),
      prisma.subject.findMany({
        where,
        include: {
          school: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
    ]);

    return sendSuccess(res, 200, subjects, "Subjects fetched successfully", {
      pagination: {
        total,
        pages: Math.ceil(total / take),
        currentPage: Number(page),
        perPage: take,
      },
    });
  } catch (err) {
    console.error("Get subjects error:", err);
    return sendError(res, 500, "Failed to fetch subjects", "INTERNAL_ERROR");
  }
};

// ==================== GET SINGLE SUBJECT ====================
export const getSubject = async (req, res) => {
  try {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id: Number(id) },
      include: {
        school: { select: { id: true, name: true } },
      },
    });

    if (!subject) {
      return sendError(res, 404, "Subject not found", "NOT_FOUND");
    }

    return sendSuccess(res, 200, subject, "Subject fetched successfully");
  } catch (err) {
    console.error("Get subject error:", err);
    return sendError(res, 500, "Failed to fetch subject", "INTERNAL_ERROR");
  }
};

// ==================== UPDATE SUBJECT ====================
export const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, schoolId } = req.body;

    const data = {};
    if (name?.trim()) data.name = name.trim();
    if (code?.trim()) data.code = code.trim().toUpperCase();
    if (description !== undefined)
      data.description = description?.trim() || null;

    if (schoolId) {
      const schoolExists = await prisma.school.findUnique({
        where: { id: Number(schoolId) },
      });
      if (!schoolExists) {
        return sendError(res, 404, "School not found", "NOT_FOUND");
      }
      data.schoolId = Number(schoolId);
    }

    const subject = await prisma.subject.update({
      where: { id: Number(id) },
      data,
      include: {
        school: { select: { id: true, name: true } },
      },
    });

    return sendSuccess(res, 200, subject, "Subject updated successfully");
  } catch (err) {
    console.error("Update subject error:", err);

    if (err.code === "P2025")
      return sendError(res, 404, "Subject not found", "NOT_FOUND");
    if (err.code === "P2002")
      return sendError(
        res,
        409,
        "Subject code already exists",
        "DUPLICATE_CODE",
      );

    return sendError(res, 500, "Failed to update subject", "INTERNAL_ERROR");
  }
};

// ==================== DELETE SUBJECT ====================
export const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.subject.delete({ where: { id: Number(id) } });

    return sendSuccess(res, 200, null, "Subject deleted successfully");
  } catch (err) {
    console.error("Delete subject error:", err);

    if (err.code === "P2025") {
      return sendError(res, 404, "Subject not found", "NOT_FOUND");
    }

    return sendError(
      res,
      500,
      "Failed to delete subject. It may be in use.",
      "INTERNAL_ERROR",
    );
  }
};

export const getClassroomSubjects = async (req, res) => {
  try {
    let { classroomId } = req.params;
    let { academicYearId } = req.query;

    const userRole = req.user.role;
    let targetClassroomId = classroomId ? Number(classroomId) : null;
    let targetStreamId = null;

    // ─── AUTO RESOLVE FOR STUDENT / PARENT ───
    if (userRole === "STUDENT" || userRole === "PARENT") {
      let studentId;

      if (userRole === "STUDENT") {
        const student = await prisma.student.findFirst({
          where: { userId: req.user.id },
          select: { id: true, classroomId: true },
        });
        if (!student) return sendError(res, 404, "Student profile not found");
        studentId = student.id;
        targetClassroomId = student.classroomId;
      } else if (userRole === "PARENT") {
        // Parent acting as a child
        if (!req.user.actingAsStudentId) {
          return sendError(
            res,
            403,
            "No child selected. Please select a child first",
          );
        }
        studentId = req.user.actingAsStudentId;
      }

      // Get student's current stream (for Class 11/12)
      const studentStream = await prisma.studentStream.findFirst({
        where: {
          studentId,
          academicYearId: academicYearId ? Number(academicYearId) : undefined,
        },
        select: { classroomId: true, streamId: true },
      });

      if (studentStream) {
        targetClassroomId = studentStream.classroomId;
        targetStreamId = studentStream.streamId;
      }
    }

    // ─── VALIDATION ───
    if (!targetClassroomId) {
      return sendError(res, 400, "classroomId is required", "VALIDATION_ERROR");
    }

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId ? Number(academicYearId) : null;
    if (!resolvedAcademicYearId) {
      const activeYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      });
      resolvedAcademicYearId = activeYear?.id;
    }

    if (!resolvedAcademicYearId) {
      return sendError(
        res,
        400,
        "No active academic year found",
        "ACADEMIC_YEAR_ERROR",
      );
    }

    // ─── FETCH SUBJECTS ───
    const curriculumSubjects = await prisma.curriculumSubject.findMany({
      where: {
        classroomId: targetClassroomId,
        academicYearId: resolvedAcademicYearId,
        // If student has a stream, only show subjects for that stream or common subjects (streamId = null)
        ...(targetStreamId && {
          OR: [{ streamId: targetStreamId }, { streamId: null }],
        }),
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
          },
        },
        stream: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        subject: { name: "asc" },
      },
    });

    // Format response for frontend
    const subjects = curriculumSubjects.map((cs) => ({
      id: cs.subject.id,
      name: cs.subject.name,
      code: cs.subject.code,
      description: cs.subject.description || "",
      streamId: cs.stream?.id || null,
      streamName: cs.stream?.name || null,
      isStreamSpecific: !!cs.streamId,
      curriculumSubjectId: cs.id,
    }));

    return sendSuccess(
      res,
      200,
      subjects,
      "Classroom subjects fetched successfully",
    );
  } catch (err) {
    console.error("Get classroom subjects error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch classroom subjects",
      "INTERNAL_ERROR",
    );
  }
};
