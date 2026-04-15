import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";

// Action API Response Formatter
export const formatPTMActionResponse = (ptm) => {
  const base = {
    id: ptm.id,
    status: ptm.status,
    responseDate: ptm.responseDate,
    responseBy: ptm.responseBy
      ? {
          id: ptm.responseBy.id,
          role: ptm.responseBy.role,
          name:
            ptm.responseBy.staff?.name ||
            ptm.responseBy.student?.name ||
            "Unknown",
        }
      : null,
  };
  if (ptm.status === "postponed") {
    return {
      ...base,
      suggestedDate: ptm.suggestedDate,
      suggestedTime: ptm.suggestedTime,
    };
  }
  return base;
};

// * Updated PTM Request controller
export const requestPTM = async (req, res) => {
  const {
    studentId,
    requestedToId,
    requestedDate,
    requestedTime,
    mode = "offline",
    purpose = "",
  } = req.body;

  const user = req.user;

  // Required fields
  if (!studentId || !requestedToId || !requestedDate || !requestedTime) {
    return sendError(
      res,
      400,
      "studentId, requestedToId, requestedDate, requestedTime required",
      "VALIDATION_ERROR",
    );
  }

  try {
    // 1. Auto-resolve current academic year
    const activeYear = await getActiveAcademicYear(user.schoolId);
    if (!activeYear) {
      return sendError(
        res,
        400,
        "No active academic year found",
        "ACADEMIC_YEAR_ERROR",
      );
    }

    // 2. Fetch student's current class & section + user role
    const student = await prisma.student.findUnique({
      where: { id: parseInt(studentId) },
      select: {
        id: true,
        userId: true, // ← critical: get student's userId
        classroom: {
          select: { name: true, section: true },
        },
        studentStreams: {
          where: { academicYearId: activeYear.id },
          take: 1,
          select: {
            classroom: { select: { name: true, section: true } },
          },
        },
      },
    });

    if (!student) {
      return sendError(res, 404, "Student not found", "NOT_FOUND");
    }

    // Get student's role (always STUDENT, but we fetch it for validation)
    const studentUser = await prisma.user.findUnique({
      where: { id: student.userId },
      select: { role: true },
    });

    if (!studentUser || studentUser.role !== "STUDENT") {
      return sendError(
        res,
        400,
        "Invalid student user role",
        "VALIDATION_ERROR",
      );
    }

    const currentClassroom =
      student.studentStreams?.[0]?.classroom || student.classroom;
    const className = currentClassroom?.name || "Unknown";
    const section = currentClassroom?.section || null;

    // 3. Fetch recipient's role (requestedToId = user ID of teacher/staff)
    const targetUser = await prisma.user.findUnique({
      where: { id: parseInt(requestedToId) },
      select: { role: true },
    });

    if (!targetUser) {
      return sendError(res, 404, "Requested user not found", "NOT_FOUND");
    }
    const requestedToRole = targetUser.role;

    // 4. Role restrictions (compare requester with STUDENT, not with requestedTo)
    if (user.role !== "ADMIN") {
      // Cannot request PTM to another user of same role as requester
      if (user.role === requestedToRole) {
        return sendError(
          res,
          400,
          "Cannot request PTM to user of same role",
          "VALIDATION_ERROR",
        );
      }

      // STUDENT or PARENT can only request STAFF/TEACHER
      if (
        (user.role === "STUDENT" || user.role === "PARENT") &&
        requestedToRole !== "STAFF"
      ) {
        return sendError(
          res,
          400,
          "Can only request staff/teachers",
          "VALIDATION_ERROR",
        );
      }

      // STAFF can only request STUDENT (parents usually initiate)
      if (user.role === "STAFF" && studentUser.role !== "STUDENT") {
        return sendError(
          res,
          400,
          "Staff can only request students",
          "VALIDATION_ERROR",
        );
      }
    }

    // 5. Parent authorization check
    if (user.role === "PARENT") {
      const link = await prisma.studentParent.findFirst({
        where: {
          parent: { userId: user.id },
          studentId: parseInt(studentId),
        },
      });
      if (!link) {
        return sendError(
          res,
          403,
          "Not authorized for this student",
          "FORBIDDEN",
        );
      }
    }

    // 6. Create PTM request
    const ptm = await prisma.pTMRequest.create({
      data: {
        studentId: parseInt(studentId),
        requestedById: user.id,
        requestedToId: parseInt(requestedToId),
        requestedDate: new Date(requestedDate),
        requestedTime: requestedTime.trim(),
        mode,
        purpose: purpose.trim() || null,
        status: "pending",
        academicYearId: activeYear.id,
        class: className,
        section,
        requestedByRole: user.role,
        requestedToRole,
      },
      include: {
        student: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, role: true } },
        requestedTo: { select: { id: true, role: true, email: true } },
      },
    });

    return sendSuccess(res, 201, ptm, "PTM request created successfully");
  } catch (err) {
    console.error("PTM request error:", err);

    if (err.code === "P2025") {
      return sendError(
        res,
        404,
        "Student or target user not found",
        "NOT_FOUND",
      );
    }

    return sendError(
      res,
      500,
      "Failed to create PTM request",
      "INTERNAL_ERROR",
    );
  }
};

// Bulk PTM Request from Teacher to Multiple Students
export const bulkRequestPTM = async (req, res) => {
  try {
    const {
      studentIds, // array of student IDs
      requestedDate,
      requestedTime,
      mode = "offline",
      purpose = "",
    } = req.body;

    const user = req.user;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return sendError(
        res,
        400,
        "studentIds array is required and cannot be empty",
        "VALIDATION_ERROR",
      );
    }

    if (!requestedDate || !requestedTime) {
      return sendError(
        res,
        400,
        "requestedDate and requestedTime are required",
        "VALIDATION_ERROR",
      );
    }

    // Only teachers/staff/admins can create bulk PTM
    if (!["STAFF", "ADMIN"].includes(user.role)) {
      return sendError(
        res,
        403,
        "Only staff and admin can create bulk PTM requests",
        "FORBIDDEN",
      );
    }

    const activeYear = await getActiveAcademicYear(user.schoolId);
    if (!activeYear) {
      return sendError(
        res,
        400,
        "No active academic year found",
        "ACADEMIC_YEAR_ERROR",
      );
    }

    // Fetch all students + their classroom info in one query
    const students = await prisma.student.findMany({
      where: {
        id: { in: studentIds.map((id) => Number(id)) },
        schoolId: user.schoolId,
      },
      select: {
        id: true,
        name: true,
        classroomId: true,
        classroom: {
          select: { name: true, section: true },
        },
      },
    });

    if (students.length === 0) {
      return sendError(res, 404, "No valid students found", "NOT_FOUND");
    }

    const createdPTMs = [];

    const ptmRequests = await prisma.$transaction(async (tx) => {
      const requests = [];

      for (const student of students) {
        const ptm = await tx.pTMRequest.create({
          data: {
            studentId: student.id,
            requestedById: user.id,
            requestedByRole: user.role,
            requestedToId: user.id,
            requestedToId: user.id,
            requestedToRole: user.role,

            requestedDate: new Date(requestedDate),
            requestedTime: requestedTime.trim(),
            mode,
            purpose: purpose.trim() || null,
            status: "pending",
            academicYearId: activeYear.id,
            class: student.classroom?.name || "Unknown",
            section: student.classroom?.section || null,
          },
          include: {
            student: { select: { id: true, name: true } },
            requestedBy: { select: { id: true, role: true } },
          },
        });

        requests.push(ptm);
      }

      return requests;
    });

    return sendSuccess(
      res,
      201,
      ptmRequests,
      `Bulk PTM request created for ${ptmRequests.length} students`,
    );
  } catch (err) {
    console.error("Bulk PTM request error:", err);
    return sendError(
      res,
      500,
      "Failed to create bulk PTM requests",
      "INTERNAL_ERROR",
    );
  }
};

export const getMyPTMs = async (req, res) => {
  const user = req.user;
  const { academicYearId, page = 1, limit = 10 } = req.query;
  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(user.schoolId);
      resolvedAcademicYearId = activeYear?.id;
    }
    const where = {
      OR: [
        { requestedById: user.id },
        { requestedToId: user.id },
        { responseById: user.id },
      ],
      ...(resolvedAcademicYearId && {
        academicYearId: parseInt(resolvedAcademicYearId),
      }),
    };

    // For STUDENT: Show all PTMs related to them as the student
    if (user.role === "STUDENT") {
      // Find the student's own ID (from user → student relation)
      const studentRecord = await prisma.student.findFirst({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!studentRecord) {
        return sendError(res, 404, "Student profile not found", "NOT_FOUND");
      }

      const studentId = studentRecord.id;

      where.OR = [
        { studentId },
        { requestedById: user.id },
        { requestedToId: user.id },
        { responseById: user.id },
      ];
    } else if (user.role === "PARENT") {
      // Existing parent logic (only selected child + personal involvement)
      const actingStudentId = user.actingAsStudentId;
      if (!actingStudentId) {
        return sendError(
          res,
          403,
          "Please select a child first",
          "CHILD_NOT_SELECTED",
        );
      }

      where.OR = [
        { studentId: actingStudentId },
        { requestedById: user.id },
        { requestedToId: user.id },
        { responseById: user.id },
      ];
    } else {
      // Staff/Admin: original logic (all they are involved in)
      where.OR = [
        { requestedById: user.id },
        { requestedToId: user.id },
        { responseById: user.id },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const [total, ptms] = await prisma.$transaction([
      prisma.pTMRequest.count({ where }),
      prisma.pTMRequest.findMany({
        where,
        select: {
          id: true,
          class: true,
          section: true,
          requestedDate: true,
          requestedTime: true,
          mode: true,
          status: true,
          purpose: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              schoolId: true,
              userId: true,
              classroomId: true,
            },
          },
          requestedBy: {
            select: {
              id: true,
              role: true,
              email: true,
              staff: { select: { name: true } },
              student: { select: { name: true } },
            },
          },
          requestedTo: {
            select: {
              id: true,
              role: true,
              email: true,
              staff: { select: { name: true } },
              student: { select: { name: true } },
            },
          },
          responseBy: {
            select: { id: true, role: true, staff: true, student: true },
          },
          academicYear: { select: { id: true, label: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    const formatted = ptms.map((p) => ({
      id: p.id,
      student: {
        id: p.student.id,
        name: p.student.name,
      },
      class: p.class,
      section: p.section,
      requestedDate: p.requestedDate,
      requestedTime: p.requestedTime,
      mode: p.mode,
      status: p.status,
      purpose: p.purpose,
      academicYear: p.academicYear?.label ?? null,
      createdAt: p.createdAt,
      requestedBy: {
        id: p.requestedBy.id,
        role: p.requestedBy.role,
        name:
          p.requestedBy.staff?.name || p.requestedBy.student?.name || "Unknown",
      },
      requestedTo: {
        id: p.requestedTo.id,
        role: p.requestedTo.role,
        name:
          p.requestedTo.staff?.name || p.requestedTo.student?.name || "Unknown",
      },
      responseBy: p.responseBy
        ? {
            id: p.responseBy.id,
            role: p.responseBy.role,
            name:
              p.responseBy.staff?.name ||
              p.responseBy.student?.name ||
              "Unknown",
          }
        : null,
    }));
    return sendSuccess(res, 200, formatted, "PTMs fetched successfully", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch your PTMs", "INTERNAL_ERROR");
  }
};

export const getPTMById = async (req, res) => {
  try {
    const { id } = req.params;
    const ptm = await prisma.pTMRequest.findUnique({
      where: { id: parseInt(id) },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            schoolId: true,
            userId: true,
            classroomId: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            role: true,
            email: true,
            staff: { select: { name: true } },
            student: { select: { name: true } },
          },
        },
        requestedTo: {
          select: {
            id: true,
            role: true,
            email: true,
            staff: { select: { name: true } },
          },
        },
      },
    });

    if (!ptm) {
      return sendError(res, 404, "PTM not found", "NOT_FOUND");
    }

    // Parent access restriction
    if (req.user.role === "PARENT") {
      const actingStudentId = req.user.actingAsStudentId;
      if (!actingStudentId || ptm.studentId !== actingStudentId) {
        return sendError(
          res,
          403,
          "You can only view PTMs for your selected child",
          "FORBIDDEN",
        );
      }
    }

    return sendSuccess(res, 200, ptm, "PTM fetched successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch PTM", "INTERNAL_ERROR");
  }
};

export const approvePTM = async (req, res) => {
  try {
    const { id } = req.params;

    const ptmCheck = await prisma.pTMRequest.findUnique({
      where: { id: Number(id) },
      select: { requestedToId: true, studentId: true, status: true },
    });

    if (!ptmCheck) {
      return sendError(res, 404, "PTM not found", "NOT_FOUND");
    }

    // // Parent restriction
    // if (req.user.role === "PARENT") {
    //   const actingStudentId = req.user.actingAsStudentId;
    //   if (!actingStudentId || ptmCheck.studentId !== actingStudentId) {
    //     return sendError(
    //       res,
    //       403,
    //       "You can only act on your selected child's PTM",
    //       "FORBIDDEN"
    //     );
    //   }
    // }

    // // Recipient or admin check
    // if (req.user.role !== "ADMIN" && ptmCheck.requestedToId !== req.user.id) {
    //   return sendError(
    //     res,
    //     403,
    //     "Only the recipient or admin can approve this request",
    //     "FORBIDDEN"
    //   );
    // }

    // Optional: Prevent re-processing
    // if (ptmCheck.status !== "pending") {
    //   return sendError(res, 400, "Request already processed", "INVALID_STATE");
    // }

    if (req.user.role !== "ADMIN") {
      const isRecipient = ptmCheck.requestedToId === req.user.userId;
      let isParentOfStudent = false;

      if (req.user.role === "PARENT") {
        const actingStudentId = req.user.actingAsStudentId;

        if (!actingStudentId) {
          return sendError(
            res,
            403,
            "Please select a child first",
            "CHILD_NOT_SELECTED",
          );
        }

        // PTM must belong to the selected child
        isParentOfStudent = ptmCheck.studentId === actingStudentId;
      }

      if (!isRecipient && !isParentOfStudent) {
        return sendError(
          res,
          403,
          "Only the recipient, parent of the selected child, or admin can approve this PTM",
          "FORBIDDEN",
        );
      }
    }

    const ptm = await prisma.pTMRequest.update({
      where: { id: Number(id) },
      data: {
        status: "approved",
        responseBy: { connect: { id: req.user.id } },
        responseByRole: req.user.role,
        responseDate: new Date(),
      },
      include: {
        responseBy: {
          select: {
            id: true,
            role: true,
            staff: { select: { name: true } },
            student: { select: { name: true } },
          },
        },
      },
    });

    return sendSuccess(
      res,
      200,
      formatPTMActionResponse(ptm),
      "PTM approved successfully",
    );
  } catch (err) {
    console.error("Approve PTM error:", err);
    return sendError(res, 500, "Failed to approve PTM", "INTERNAL_ERROR");
  }
};

export const postponePTM = async (req, res) => {
  try {
    const { id } = req.params;
    const { suggestedDate, suggestedTime } = req.body;

    if (!suggestedDate || !suggestedTime) {
      return sendError(
        res,
        400,
        "suggestedDate and suggestedTime are required",
        "VALIDATION_ERROR",
      );
    }

    const ptmCheck = await prisma.pTMRequest.findUnique({
      where: { id: Number(id) },
      select: { requestedToId: true, studentId: true, status: true },
    });

    if (!ptmCheck) {
      return sendError(res, 404, "PTM not found", "NOT_FOUND");
    }

    // // Parent restriction
    // if (req.user.role === "PARENT") {
    //   const actingStudentId = req.user.actingAsStudentId;
    //   if (!actingStudentId || ptmCheck.studentId !== actingStudentId) {
    //     return sendError(
    //       res,
    //       403,
    //       "You can only act on your selected child's PTM",
    //       "FORBIDDEN"
    //     );
    //   }
    // }

    // // Recipient or admin check
    // if (req.user.role !== "ADMIN" && ptmCheck.requestedToId !== req.user.id) {
    //   return sendError(
    //     res,
    //     403,
    //     "Only the recipient or admin can postpone this request",
    //     "FORBIDDEN"
    //   );
    // }
    if (req.user.role !== "ADMIN") {
      const isRecipient = ptmCheck.requestedToId === req.user.userId;
      let isParentOfStudent = false;

      if (req.user.role === "PARENT") {
        const actingStudentId = req.user.actingAsStudentId;

        if (!actingStudentId) {
          return sendError(
            res,
            403,
            "Please select a child first",
            "CHILD_NOT_SELECTED",
          );
        }

        // PTM must belong to the selected child
        isParentOfStudent = ptmCheck.studentId === actingStudentId;
      }

      if (!isRecipient && !isParentOfStudent) {
        return sendError(
          res,
          403,
          "Only the recipient, parent of the selected child, or admin can approve this PTM",
          "FORBIDDEN",
        );
      }
    }

    const ptm = await prisma.pTMRequest.update({
      where: { id: Number(id) },
      data: {
        status: "postponed",
        suggestedDate: new Date(suggestedDate),
        suggestedTime,
        responseBy: { connect: { id: req.user.id } },
        responseByRole: req.user.role,
        responseDate: new Date(),
      },
      include: {
        responseBy: {
          select: {
            id: true,
            role: true,
            staff: { select: { name: true } },
            student: { select: { name: true } },
          },
        },
      },
    });

    return sendSuccess(
      res,
      200,
      formatPTMActionResponse(ptm),
      "PTM postponed successfully",
    );
  } catch (err) {
    console.error("Postpone PTM error:", err);
    return sendError(res, 500, "Failed to postpone PTM", "INTERNAL_ERROR");
  }
};

export const rejectPTM = async (req, res) => {
  try {
    const { id } = req.params;

    const ptmCheck = await prisma.pTMRequest.findUnique({
      where: { id: Number(id) },
      select: { requestedToId: true, studentId: true, status: true },
    });

    if (!ptmCheck) {
      return sendError(res, 404, "PTM not found", "NOT_FOUND");
    }

    // // Parent restriction
    // if (req.user.role === "PARENT") {
    //   const actingStudentId = req.user.actingAsStudentId;
    //   if (!actingStudentId || ptmCheck.studentId !== actingStudentId) {
    //     return sendError(
    //       res,
    //       403,
    //       "You can only act on your selected child's PTM",
    //       "FORBIDDEN"
    //     );
    //   }
    // }

    // // Recipient or admin check
    // if (req.user.role !== "ADMIN" && ptmCheck.requestedToId !== req.user.id) {
    //   return sendError(
    //     res,
    //     403,
    //     "Only the recipient or admin can reject this request",
    //     "FORBIDDEN"
    //   );
    // }

    if (req.user.role !== "ADMIN") {
      const isRecipient = ptmCheck.requestedToId === req.user.userId;
      let isParentOfStudent = false;

      if (req.user.role === "PARENT") {
        const actingStudentId = req.user.actingAsStudentId;

        if (!actingStudentId) {
          return sendError(
            res,
            403,
            "Please select a child first",
            "CHILD_NOT_SELECTED",
          );
        }

        // PTM must belong to the selected child
        isParentOfStudent = ptmCheck.studentId === actingStudentId;
      }

      if (!isRecipient && !isParentOfStudent) {
        return sendError(
          res,
          403,
          "Only the recipient, parent of the selected child, or admin can approve this PTM",
          "FORBIDDEN",
        );
      }
    }

    const ptm = await prisma.pTMRequest.update({
      where: { id: Number(id) },
      data: {
        status: "rejected",
        responseBy: { connect: { id: req.user.id } },
        responseByRole: req.user.role,
        responseDate: new Date(),
      },
      include: {
        responseBy: {
          select: {
            id: true,
            role: true,
            staff: { select: { name: true } },
            student: { select: { name: true } },
          },
        },
      },
    });

    return sendSuccess(
      res,
      200,
      formatPTMActionResponse(ptm),
      "PTM rejected successfully",
    );
  } catch (err) {
    console.error("Reject PTM error:", err);
    return sendError(res, 500, "Failed to reject PTM", "INTERNAL_ERROR");
  }
};

export const getAllPTMs = async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return sendError(res, 403, "Admin only", "FORBIDDEN");
  }
  const { academicYearId, status, page = 1, limit = 10 } = req.query;
  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(req.user.schoolId);
      resolvedAcademicYearId = activeYear?.id;
    }
    const where = {
      ...(resolvedAcademicYearId && {
        academicYearId: parseInt(resolvedAcademicYearId),
      }),
    };
    if (status) where.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const [total, ptms] = await prisma.$transaction([
      prisma.pTMRequest.count({ where }),
      prisma.pTMRequest.findMany({
        where,
        select: {
          id: true,
          class: true,
          section: true,
          requestedDate: true,
          requestedTime: true,
          mode: true,
          status: true,
          purpose: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              schoolId: true,
              userId: true,
              classroomId: true,
            },
          },
          requestedBy: {
            select: {
              id: true,
              role: true,
              email: true,
              staff: { select: { name: true } },
              student: { select: { name: true } },
            },
          },
          requestedTo: {
            select: {
              id: true,
              role: true,
              email: true,
              staff: { select: { name: true } },
              student: { select: { name: true } },
            },
          },
          responseBy: {
            select: { id: true, role: true, staff: true, student: true },
          },
          academicYear: { select: { id: true, label: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    const formatted = ptms.map((p) => ({
      id: p.id,
      student: {
        id: p.student.id,
        name: p.student.name,
      },
      class: p.class,
      section: p.section,
      requestedDate: p.requestedDate,
      requestedTime: p.requestedTime,
      mode: p.mode,
      status: p.status,
      purpose: p.purpose,
      academicYear: p.academicYear?.label ?? null,
      createdAt: p.createdAt,
      requestedBy: {
        id: p.requestedBy.id,
        role: p.requestedBy.role,
        name:
          p.requestedBy.staff?.name || p.requestedBy.student?.name || "Unknown",
      },
      requestedTo: {
        id: p.requestedTo.id,
        role: p.requestedTo.role,
        name:
          p.requestedTo.staff?.name || p.requestedTo.student?.name || "Unknown",
      },
      responseBy: p.responseBy
        ? {
            id: p.responseBy.id,
            role: p.responseBy.role,
            name:
              p.responseBy.staff?.name ||
              p.responseBy.student?.name ||
              "Unknown",
          }
        : null,
    }));
    sendSuccess(res, 200, formatted, "PTM Fetched Successfully", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch PTMs", "INTERNAL_ERROR");
  }
};

export const deletePTM = async (req, res) => {
  try {
    await prisma.pTMRequest.delete({ where: { id: Number(req.params.id) } });
    return sendSuccess(res, 200, null, "PTM deleted successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return sendError(res, 404, "PTM not found", "NOT_FOUND");
    return sendError(res, 500, "Failed to delete PTM", "INTERNAL_ERROR");
  }
};

// For Teachers → Search Students
export const searchStudentsForPTM = async (req, res) => {
  const {
    search = "",
    page = 1,
    limit = 15,
    classroomId,
    section,
    streamId,
    academicYearId,
  } = req.query;

  // Optional: Require minimum search length (uncomment if needed)
  // if (search.trim().length < 2) {
  //   return res.status(400).json({ error: "Search query must be at least 2 characters" });
  // }

  try {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(5, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    if (search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        {
          studentStreams: {
            some: { rollNo: { contains: search.trim() } },
          },
        },
      ];
    }

    if (req.user.role === "TEACHER" || req.user.role === "STAFF") {
      const staff = await prisma.staff.findUnique({
        where: { userId: req.user.userId },
        select: { id: true },
      });

      if (!staff) {
        return res.status(403).json({
          error: "Staff/Teacher profile not linked to this user account",
        });
      }

      const teacherId = staff.id;

      const currentClasses = await prisma.timetableSlot.findMany({
        where: {
          teacherId,
          academicYearId: academicYearId ? parseInt(academicYearId) : undefined,
        },
        select: { classroomId: true },
        distinct: ["classroomId"],
      });

      if (currentClasses.length > 0) {
        where.studentStreams = {
          some: {
            classroomId: { in: currentClasses.map((c) => c.classroomId) },
            ...(academicYearId && { academicYearId: parseInt(academicYearId) }),
          },
        };
      } else {
        return res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
          },
        });
      }
    }

    const streamFilter = streamId ? { streamId: parseInt(streamId) } : {};
    const classroomFilter = classroomId
      ? { classroomId: parseInt(classroomId) }
      : {};
    const sectionFilter = section
      ? { classroom: { section: section.toUpperCase() } }
      : {};

    if (
      Object.keys({ ...streamFilter, ...classroomFilter, ...sectionFilter })
        .length > 0
    ) {
      where.studentStreams = {
        some: {
          ...streamFilter,
          ...classroomFilter,
          ...sectionFilter,
          ...(academicYearId && { academicYearId: parseInt(academicYearId) }),
        },
      };
    }

    const total = await prisma.student.count({ where });

    const students = await prisma.student.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        classroom: {
          select: { name: true, section: true },
        },
        studentStreams: {
          take: 1,
          orderBy: { academicYear: { startDate: "desc" } },
          select: {
            rollNo: true,
            stream: { select: { name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const data = students.map((s) => ({
      id: s.id,
      name: s.name,
      rollNo: s.studentStreams?.[0]?.rollNo || "N/A",
      stream: s.studentStreams?.[0]?.stream?.name || null,
      classroom: s.classroom
        ? `${s.classroom.name}${s.classroom.section ? ` - ${s.classroom.section}` : ""}`
        : "Not Assigned",
    }));

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("Error in searchStudentsForPTM:", err);
    res.status(500).json({ error: "Failed to search students" });
  }
};

// For Students/Parents → Search Teachers
export const searchTeachersForPTM = async (req, res) => {
  const {
    search = "",
    page = "1",
    limit = 10,
    subjectId,
    classroomId,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

  if (isNaN(pageNum) || isNaN(limitNum)) {
    return res.status(400).json({ error: "Invalid page or limit value" });
  }

  // if (search.trim().length < 2) {
  //   return res
  //     .status(400)
  //     .json({ error: "Search requires at least 2 characters" });
  // }

  let studentId;
  if (req.user.role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!student)
      return res.status(404).json({ error: "Student profile not found" });
    studentId = student.id;
  } else if (req.user.role === "PARENT") {
    studentId = req.user.actingAsStudentId;
    if (!studentId) {
      return res.status(400).json({ error: "Please select a child first" });
    }
  } else {
    return res
      .status(403)
      .json({ error: "Only students or parents can search teachers" });
  }

  try {
    const enrollment = await prisma.studentStream.findFirst({
      where: {
        studentId,
        academicYear: { isActive: true },
      },
      select: { classroomId: true, streamId: true },
    });

    if (!enrollment) {
      return res.status(404).json({ error: "No active enrollment found" });
    }

    const where = {
      OR: [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ],
      teacherAssignments: {
        some: {
          classroomId: enrollment.classroomId,
          ...(enrollment.streamId && { streamId: enrollment.streamId }),
          ...(subjectId && { subjectId: parseInt(subjectId) }),
          ...(classroomId && { classroomId: parseInt(classroomId) }), // extra filter
        },
      },
    };

    const [total, teachers] = await Promise.all([
      prisma.staff.count({ where }),
      prisma.staff.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        select: {
          id: true,
          name: true,
          email: true,
          subjects: { select: { name: true } },
          teacherAssignments: {
            take: 1,
            select: { classroom: { select: { name: true, section: true } } },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const data = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      subjects: t.subjects.map((s) => s.name),
      classroom: t.teacherAssignments?.[0]?.classroom
        ? `${t.teacherAssignments[0].classroom.name}${
            t.teacherAssignments[0].classroom.section
              ? ` - ${t.teacherAssignments[0].classroom.section}`
              : ""
          }`
        : null,
    }));

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("Error in searchTeachersForPTM:", err);
    res.status(500).json({ error: "Failed to search teachers" });
  }
};
