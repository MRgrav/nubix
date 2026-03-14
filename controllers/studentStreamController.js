// controllers\studentStreamController.js
import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { generateRollNo } from "../utils/rollNoGenerator.js";
import { sendError, sendSuccess } from "./../utils/responseStructure.js";

export const enrollStudentInStream = async (req, res) => {
  const { studentId, streamId, classroomId } = req.body;

  if (!studentId) {
    return sendError(res, 400, "studentId is required", "VALIDATION_ERROR");
  }

  try {
    const activeYear = await getActiveAcademicYear();
    if (!activeYear) {
      return sendError(
        res,
        400,
        "No active academic year found",
        "ACADEMIC_YEAR_ERROR",
      );
    }

    const ayId = activeYear.id;
    const studentIdNum = parseInt(studentId);

    // 1. Check if student is already enrolled in this academic year
    const existingEnrollment = await prisma.studentStream.findUnique({
      where: {
        academicYearId_studentId: {
          academicYearId: ayId,
          studentId: studentIdNum,
        },
      },
    });

    if (existingEnrollment) {
      return sendError(
        res,
        409,
        "Student is already enrolled for this academic year",
        "CONFLICT",
        {
          existingEnrollmentId: existingEnrollment.id,
          currentStreamId: existingEnrollment.streamId,
          currentClassroomId: existingEnrollment.classroomId,
          note: "Use update endpoint to change stream or class",
        },
      );
    }

    // 2. Fetch student to validate existence + school
    const student = await prisma.student.findUnique({
      where: { id: studentIdNum },
      select: { id: true, schoolId: true },
    });

    if (!student) {
      return sendError(res, 404, "Student not found", "NOT_FOUND");
    }

    let rollNo = null;
    let finalClassroomId = classroomId ? parseInt(classroomId) : null;

    // 3. Stream assignment logic
    if (streamId) {
      // Stream requires classroom
      if (!finalClassroomId) {
        return sendError(
          res,
          400,
          "classroomId is required when assigning a stream",
          "VALIDATION_ERROR",
        );
      }

      // Generate roll number for Class 11/12
      rollNo = await generateRollNo(prisma, {
        academicYearId: ayId,
        classroomId: finalClassroomId,
        streamId: parseInt(streamId),
        schoolId: student.schoolId,
      });
    }

    // 4. Create enrollment
    const enrollment = await prisma.studentStream.create({
      data: {
        studentId: studentIdNum,
        academicYearId: ayId,
        classroomId: finalClassroomId,
        streamId: streamId ? parseInt(streamId) : null,
        rollNo,
      },
      include: {
        student: { select: { id: true, name: true } },
        stream: streamId ? { select: { id: true, name: true } } : undefined,
        classroom: finalClassroomId
          ? { select: { id: true, name: true, section: true } }
          : undefined,
        academicYear: { select: { id: true, label: true } },
      },
    });

    // 5. Update student's direct classroom reference (if changed)
    if (finalClassroomId) {
      await prisma.student.update({
        where: { id: studentIdNum },
        data: { classroomId: finalClassroomId },
      });
    }

    return sendSuccess(
      res,
      201,
      enrollment,
      "Student successfully enrolled in stream/class",
      {
        rollNo,
        note: rollNo
          ? "Roll number generated"
          : "No roll number (stream not assigned)",
      },
    );
  } catch (err) {
    console.error("Enroll student error:", err);
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Enrollment already exists for this year",
        "CONFLICT",
      );
    }
    if (err.code === "P2025") {
      return sendError(
        res,
        404,
        "Student, classroom, stream, or academic year not found",
        "NOT_FOUND",
      );
    }
    return sendError(res, 500, "Failed to enroll student", "INTERNAL_ERROR");
  }
};

export const getStudentStreams = async (req, res) => {
  const { studentId, academicYearId, page = 1, limit = 20 } = req.query;

  try {
    const where = {};

    if (studentId) where.studentId = parseInt(studentId);
    if (academicYearId) where.academicYearId = parseInt(academicYearId);

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [total, studentStreams] = await prisma.$transaction([
      prisma.studentStream.count({ where }),
      prisma.studentStream.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          student: { select: { id: true, name: true, email: true } },
          stream: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true, section: true } },
          academicYear: { select: { id: true, label: true } },
        },
        orderBy: [{ academicYear: { label: "desc" } }, { createdAt: "desc" }],
      }),
    ]);

    return sendSuccess(
      res,
      200,
      studentStreams,
      "Student enrollments fetched successfully",
      {
        total,
        pages: Math.ceil(total / limitNum),
        currentPage: pageNum,
        perPage: limitNum,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    );
  } catch (err) {
    console.error("Get student streams error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch student enrollments",
      "INTERNAL_ERROR",
    );
  }
};

export const getStudentStream = async (req, res) => {
  const { id } = req.params;

  try {
    const studentStream = await prisma.studentStream.findUnique({
      where: { id: parseInt(id) },
      include: {
        student: { select: { id: true, name: true, email: true } },
        stream: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true, section: true } },
        academicYear: { select: { id: true, label: true } },
      },
    });

    if (!studentStream) {
      return sendError(res, 404, "Student enrollment not found", "NOT_FOUND");
    }

    return sendSuccess(
      res,
      200,
      studentStream,
      "Student enrollment details fetched",
    );
  } catch (err) {
    console.error("Get student stream error:", err);
    return sendError(res, 500, "Failed to fetch enrollment", "INTERNAL_ERROR");
  }
};

export const updateStudentStream = async (req, res) => {
  const { id } = req.params;
  const { streamId, classroomId } = req.body;
  try {
    const data = {};
    if (streamId !== undefined)
      data.stream = streamId
        ? { connect: { id: parseInt(streamId) } }
        : { disconnect: true };
    if (classroomId)
      data.classroom = { connect: { id: parseInt(classroomId) } };

    const studentStream = await prisma.studentStream.update({
      where: { id: parseInt(id) },
      data,
      include: {
        stream: {
          select: {
            id: true,
            name: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            schoolId: true,
          },
        },
      },
    });
    return sendSuccess(
      res,
      200,
      studentStream,
      "Student stream/class updated successfully",
    );
  } catch (err) {
    console.error("Update student stream error:", err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Student enrollment not found", "NOT_FOUND");
    }
    return sendError(res, 500, "Failed to update enrollment", "INTERNAL_ERROR");
  }
};

export const unenrollStudent = async (req, res) => {
  const { id } = req.params;

  try {
    const enrollment = await prisma.studentStream.findUnique({
      where: { id: parseInt(id) },
      select: { id: true, studentId: true, classroomId: true },
    });

    if (!enrollment) {
      return sendError(res, 404, "Enrollment not found", "NOT_FOUND");
    }

    await prisma.studentStream.delete({
      where: { id: parseInt(id) },
    });

    // Optional: clear student's direct classroom reference if needed
    await prisma.student.update({
      where: { id: enrollment.studentId },
      data: { classroomId: null },
    });

    return sendSuccess(
      res,
      200,
      { enrollmentId: enrollment.id },
      "Student successfully unenrolled",
    );
  } catch (err) {
    console.error("Unenroll student error:", err);
    if (err.code === "P2025") {
      return sendError(res, 404, "Enrollment not found", "NOT_FOUND");
    }
    return sendError(res, 500, "Failed to unenroll student", "INTERNAL_ERROR");
  }
};

// Mobile APIs for student
export const getMyEnrollment = async (req, res) => {
  const user = req.user;
  let studentId;

  try {
    // Resolve studentId (same logic as your other student APIs)
    if (user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!student) return sendError(res, 404, "Student profile not found");
      studentId = student.id;
    } else if (user.role === "PARENT") {
      if (!user.actingAsStudentId) {
        return sendError(res, 403, "No child selected");
      }
      studentId = user.actingAsStudentId;
    } else {
      return sendError(res, 403, "Only students or parents can access this");
    }

    const activeYear = await getActiveAcademicYear(user.schoolId);
    if (!activeYear) return sendError(res, 400, "No active academic year");

    const enrollment = await prisma.studentStream.findFirst({
      where: {
        studentId,
        academicYearId: activeYear.id,
      },
      include: {
        classroom: { select: { id: true, name: true, section: true } },
        stream: { select: { id: true, name: true } },
        academicYear: { select: { id: true, label: true, isActive: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!enrollment) {
      return sendSuccess(
        res,
        200,
        null,
        "No active enrollment found for current year",
      );
    }

    return sendSuccess(
      res,
      200,
      enrollment,
      "Current enrollment fetched successfully",
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch enrollment");
  }
};
