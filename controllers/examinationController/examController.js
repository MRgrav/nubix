// controllers\examinationController\examController.js
import prisma from "./../../models/prisma.js";
import { sendError, sendSuccess } from "./../../utils/responseStructure.js";
import z from "zod";

// Base schema
const examBaseSchema = z.object({
  termId: z.number().int().positive("Term ID required"),
  classroomId: z.number().int().positive("Classroom ID required"),
  subjectId: z.number().int().positive("Subject ID required"),
  streamId: z.number().int().positive().optional().nullable(),
  configId: z.number().int().positive("Config ID required"),
  examDate: z
    .string()
    .refine(
      (val) => !isNaN(Date.parse(val)),
      "Invalid exam date (use YYYY-MM-DD)",
    ),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}$/, "Invalid time format (use HH:mm:ss)")
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}$/, "Invalid time format (use HH:mm:ss)")
    .optional(),
  venue: z.string().optional(),
  maxMarks: z.number().int().positive().optional(),
  passMarks: z.number().int().nonnegative().optional(),
  carryForward: z.boolean().optional().default(false),
  isSupplementary: z.boolean().optional().default(false),
  attachments: z
    .array(z.object({ url: z.string().url(), type: z.string().optional() }))
    .optional(),
});

// Create schema
const createExamSchema = examBaseSchema.refine(
  (data) =>
    !(data.startTime && !data.endTime) && !(data.endTime && !data.startTime),
  {
    message: "Both startTime and endTime must be provided together or neither",
    path: ["startTime"],
  },
);

// Update schema — partial, no refinement (allowed to update one time field)
const updateExamSchema = examBaseSchema.partial();

export const createExam = async (req, res) => {
  try {
    if (!["ADMIN", "STAFF"].includes(req.user.role)) {
      return sendError(
        res,
        403,
        "Only Admin or Staff can create exams",
        "FORBIDDEN",
      );
    }

    const data = createExamSchema.parse(req.body);

    // ─── 1. Validate term exists ───
    const term = await prisma.examTerm.findUnique({
      where: { id: data.termId },
      include: { academicYear: true },
    });
    if (!term) return sendError(res, 404, "Term not found", "NOT_FOUND");

    const examDate = new Date(data.examDate);

    // Validate date within academic year range
    if (
      examDate < term.academicYear.startDate ||
      examDate > term.academicYear.endDate
    ) {
      return sendError(
        res,
        400,
        `Exam date must be within academic year range (${term.academicYear.startDate.toISOString().split("T")[0]} – ${term.academicYear.endDate.toISOString().split("T")[0]})`,
        "DATE_OUT_OF_RANGE",
      );
    }

    // ─── 2. Validate classroom exists ───
    const classroom = await prisma.classroom.findUnique({
      where: { id: data.classroomId },
      select: { id: true, name: true },
    });
    if (!classroom)
      return sendError(res, 404, "Classroom not found", "NOT_FOUND");

    // ─── 3. Validate subject exists ───
    const subject = await prisma.subject.findUnique({
      where: { id: data.subjectId },
      select: { id: true, name: true },
    });
    if (!subject) return sendError(res, 404, "Subject not found", "NOT_FOUND");

    // == Class 1-10 cannot have stream ===
    const className = classroom.name.trim().toLowerCase();
    const isHigherClass = ["11", "12", "class 11", "class 12"].some((c) =>
      className.includes(c),
    );

    if (!isHigherClass && data.streamId) {
      return sendError(
        res,
        400,
        "Stream can only be assigned for Class 11 and 12",
        "STREAM_NOT_ALLOWED",
      );
    }
    // ─── 4. Validate curriculum match (class + subject + stream) ───
    const curriculumEntry = await prisma.curriculumSubject.findFirst({
      where: {
        subjectId: data.subjectId,
        classroomId: data.classroomId,
        academicYearId: term.academicYearId,
        OR: [{ streamId: data.streamId || null }, { streamId: null }],
      },
    });

    if (!curriculumEntry) {
      return sendError(
        res,
        400,
        `Subject "${subject.name}" is not assigned to this classroom in the current academic year`,
        "CURRICULUM_MISMATCH",
      );
    }

    // ─── 5. Time conflict check ───
    let startDateTime = null;
    let endDateTime = null;

    if (data.startTime && data.endTime) {
      startDateTime = new Date(`${data.examDate}T${data.startTime}`);
      endDateTime = new Date(`${data.examDate}T${data.endTime}`);

      if (endDateTime <= startDateTime) {
        return sendError(
          res,
          400,
          "End time must be after start time",
          "TIME_RANGE_INVALID",
        );
      }

      const overlapping = await prisma.exam.findFirst({
        where: {
          classroomId: data.classroomId,
          examDate,
          OR: [
            {
              startTime: { lte: endDateTime },
              endTime: { gte: startDateTime },
            },
            { startTime: null, endTime: null },
          ],
        },
      });

      if (overlapping)
        return sendError(
          res,
          409,
          "Time conflict in this classroom",
          "TIME_CONFLICT",
        );
    }

    // ─── 6. Max/pass marks validation ───
    if (data.maxMarks && data.passMarks && data.passMarks > data.maxMarks) {
      return sendError(res, 400, "Pass marks cannot exceed max marks");
    }

    // ─── 7. Validate config exists and matches academic year ───
    const config = await prisma.examConfig.findUnique({
      where: { id: data.configId },
      include: { board: true, academicYear: true },
    });
    if (!config || config.academicYearId !== term.academicYearId) {
      return sendError(
        res,
        400,
        "Invalid config or academic year mismatch",
        "CONFIG_MISMATCH",
      );
    }

    // ─── 8. Create the exam ───
    const exam = await prisma.exam.create({
      data: {
        termId: data.termId,
        classroomId: data.classroomId,
        subjectId: data.subjectId,
        streamId: data.streamId || null,
        configId: data.configId,
        examDate: examDate,
        startTime: startDateTime,
        endTime: endDateTime,
        venue: data.venue?.trim() || null,
        maxMarks: data.maxMarks,
        passMarks: data.passMarks,
        carryForward: data.carryForward,
        isSupplementary: data.isSupplementary,
        attachments: data.attachments ? JSON.stringify(data.attachments) : null,
        createdById: req.user.id,
        status: "DRAFT",
      },
      include: {
        term: { select: { id: true, termName: true } },
        classroom: { select: { name: true, section: true } },
        subject: { select: { name: true, code: true } },
        stream: data.streamId ? { select: { name: true } } : false,
        config: { select: { name: true, weightage: true } },
        createdBy: { select: { id: true, email: true, role: true } },
      },
    });

    return sendSuccess(res, 201, exam, "Exam scheduled successfully");
  } catch (err) {
    console.error("Create exam error:", err);

    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
        "VALIDATION_ERROR",
      );
    }

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Duplicate exam: this term/class/subject/stream combination already exists",
        "EXAM_DUPLICATE",
      );
    }

    if (err.code === "P2025") {
      return sendError(
        res,
        404,
        "Reference not found (term/classroom/subject/config)",
        "NOT_FOUND",
      );
    }

    return sendError(
      res,
      500,
      "Failed to create exam",
      err.message || "Internal server error",
    );
  }
};

/**
 * Get list of exams with filters (including streamId)
 * Accessible to ADMIN, STAFF, STUDENT, PARENT (with restrictions)
 */
export const getExams = async (req, res) => {
  const {
    termId,
    classroomId,
    subjectId,
    streamId: rawStreamId,
    status,
    page = 1,
    limit = 20,
  } = req.query;

  try {
    const where = {};

    // Parse filters
    if (termId) where.termId = Number(termId);
    if (classroomId) where.classroomId = Number(classroomId);
    if (subjectId) where.subjectId = Number(subjectId);
    if (rawStreamId) where.streamId = Number(rawStreamId);
    if (status) where.status = status.toUpperCase();

    // School isolation
    if (req.user.schoolId) {
      where.classroom = { schoolId: req.user.schoolId };
    }

    // Role-based restrictions (unchanged)
    if (req.user.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: req.user.userId },
        select: {
          classroomId: true,
          studentStreams: { select: { streamId: true } },
        },
      });
      if (student) {
        where.classroomId = student.classroomId;
        if (student.studentStreams?.[0]?.streamId) {
          where.OR = [
            { streamId: student.studentStreams[0].streamId },
            { streamId: null },
          ];
        }
      }
    } else if (req.user.role === "PARENT") {
      const actingStudentId = req.user.actingAsStudentId;
      if (actingStudentId) {
        const student = await prisma.student.findUnique({
          where: { id: actingStudentId },
          select: {
            classroomId: true,
            studentStreams: { select: { streamId: true } },
          },
        });
        if (student) {
          where.classroomId = student.classroomId;
          if (student.studentStreams?.[0]?.streamId) {
            where.OR = [
              { streamId: student.studentStreams[0].streamId },
              { streamId: null },
            ];
          }
        }
      }
    }

    // Pagination
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const total = await prisma.exam.count({ where });

    const exams = await prisma.exam.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        term: {
          select: {
            id: true,
            termName: true, // safe field
          },
        },
        classroom: { select: { name: true, section: true } },
        subject: { select: { name: true, code: true } },
        stream: rawStreamId ? { select: { name: true } } : false,
        createdBy: { select: { id: true, email: true, role: true } },
        updatedBy: { select: { id: true, email: true, role: true } },
        config: true,
        _count: { select: { marks: true } },
      },
      orderBy: { examDate: "asc" },
    });

    return sendSuccess(res, 200, exams, "Exams fetched successfully", {
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext: skip + limitNum < total,
        hasPrev: pageNum > 1,
      },
      filtersApplied: {
        termId: termId || null,
        classroomId: classroomId || null,
        subjectId: subjectId || null,
        streamId: rawStreamId || null,
        status: status || null,
      },
    });
  } catch (err) {
    console.error("Get exams error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch exams",
      err.message || "Internal server error",
    );
  }
};

/**
 * Update an existing exam (ADMIN/STAFF)
 * Allows updating streamId (null = common exam)
 */
export const updateExam = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const data = updateExamSchema.parse(updates);

    const existing = await prisma.exam.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        status: true,
        classroomId: true,
        termId: true,
        subjectId: true,
        streamId: true,
      },
    });

    if (!existing) return sendError(res, 404, "Exam not found");

    // ─── Status workflow validation (state machine) ───
    const allowedTransitions = {
      DRAFT: ["SCHEDULED", "CANCELLED"],
      SCHEDULED: ["ONGOING", "CANCELLED"],
      ONGOING: ["COMPLETED"],
      COMPLETED: ["PUBLISHED"],
      PUBLISHED: [],
      CANCELLED: [],
    };

    if (data.status) {
      const currentStatus = existing.status;
      const newStatus = data.status.toUpperCase();

      if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
        return sendError(
          res,
          400,
          `Invalid status transition: ${currentStatus} → ${newStatus} not allowed`,
          "INVALID_STATUS_TRANSITION",
        );
      }

      // Only ADMIN can publish or mark completed
      if (
        ["COMPLETED", "PUBLISHED"].includes(newStatus) &&
        req.user.role !== "ADMIN"
      ) {
        return sendError(
          res,
          403,
          "Only Admin can mark exam as completed or published",
          "FORBIDDEN",
        );
      }
    }

    // ─── Prepare update data ───
    const updateData = {};

    if (data.termId !== undefined) updateData.termId = data.termId;
    if (data.classroomId !== undefined)
      updateData.classroomId = data.classroomId;
    if (data.subjectId !== undefined) updateData.subjectId = data.subjectId;

    // Allow updating streamId (null = common exam across streams)
    if (updates.streamId !== undefined) {
      updateData.streamId = updates.streamId ? Number(updates.streamId) : null;
    }

    if (data.examDate) updateData.examDate = new Date(data.examDate);
    if (data.startTime !== undefined) {
      updateData.startTime = data.startTime ? new Date(data.startTime) : null;
    }
    if (data.endTime !== undefined) {
      updateData.endTime = data.endTime ? new Date(data.endTime) : null;
    }
    if (data.venue !== undefined) {
      updateData.venue = data.venue?.trim() || null;
    }
    if (data.maxMarks !== undefined) updateData.maxMarks = data.maxMarks;
    if (data.passMarks !== undefined) updateData.passMarks = data.passMarks;
    if (data.carryForward !== undefined)
      updateData.carryForward = data.carryForward;
    if (data.isSupplementary !== undefined)
      updateData.isSupplementary = data.isSupplementary;
    if (data.attachments !== undefined) {
      updateData.attachments = data.attachments
        ? JSON.stringify(data.attachments)
        : null;
    }
    if (data.status) updateData.status = data.status.toUpperCase();

    updateData.updatedById = req.user.id;

    // ─── Re-validate curriculum if term/class/subject/stream changed ───
    if (
      data.termId ||
      data.classroomId ||
      data.subjectId ||
      updates.streamId !== undefined
    ) {
      const termIdToCheck = data.termId || existing.termId;
      const term = await prisma.examTerm.findUnique({
        where: { id: termIdToCheck },
        include: { academicYear: true },
      });

      if (!term) return sendError(res, 404, "Term not found", "NOT_FOUND");

      const classroomIdToCheck = data.classroomId || existing.classroomId;
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomIdToCheck },
        select: { name: true },
      });

      if (!classroom) return sendError(res, 404, "Classroom not found");

      const streamIdToCheck =
        updates.streamId !== undefined
          ? updates.streamId
            ? Number(updates.streamId)
            : null
          : existing.streamId;

      // const normalizedClassName = classroom.name.replace(/\D/g, "").trim();
      // In Update Exam
      const curriculumWhere = {
        subjectId: data.subjectId || existing.subjectId,
        classroomId: classroomIdToCheck,
        academicYearId: term.academicYearId,
      };

      if (streamIdToCheck) {
        curriculumWhere.OR = [
          { streamId: streamIdToCheck },
          { streamId: null },
        ];
      } else {
        curriculumWhere.streamId = null;
      }

      const curriculumEntry = await prisma.curriculumSubject.findFirst({
        where: curriculumWhere,
      });

      if (!curriculumEntry) {
        return sendError(
          res,
          400,
          "Updated subject is not assigned to this class/stream in the term's academic year",
          "CURRICULUM_MISMATCH",
        );
      }
    }

    // ─── Duplicate re-check after potential streamId change ───
    const newDuplicateWhere = {
      termId: data.termId || existing.termId,
      classroomId: data.classroomId || existing.classroomId,
      subjectId: data.subjectId || existing.subjectId,
      streamId:
        updates.streamId !== undefined
          ? updates.streamId
            ? Number(updates.streamId)
            : null
          : existing.streamId,
      id: { not: Number(id) }, // exclude self
    };

    const duplicateAfterUpdate = await prisma.exam.findFirst({
      where: newDuplicateWhere,
    });

    if (duplicateAfterUpdate) {
      return sendError(
        res,
        409,
        "Update would create duplicate exam for this term/class/subject/stream combination",
        "EXAM_DUPLICATE_AFTER_UPDATE",
      );
    }

    const updated = await prisma.exam.update({
      where: { id: Number(id) },
      data: updateData,
      include: {
        term: true,
        classroom: true,
        subject: true,
        stream:
          updates.streamId !== undefined ? { select: { name: true } } : false,
        createdBy: { select: { email: true, role: true } },
        updatedBy: { select: { email: true, role: true } },
      },
    });

    return sendSuccess(res, 200, updated, "Exam updated successfully");
  } catch (err) {
    console.error("Update exam error:", err);

    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
        "VALIDATION_ERROR",
      );
    }

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Database constraint violation: duplicate exam entry",
        "EXAM_DUPLICATE",
      );
    }

    if (err.code === "P2025") {
      return sendError(res, 404, "Exam not found", "NOT_FOUND");
    }

    return sendError(res, 500, "Failed to update exam", "INTERNAL_ERROR");
  }
};

// Update Exam Status (with validation)
export const updateExamStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedTransitions = {
    DRAFT: ["SCHEDULED", "CANCELLED"],
    SCHEDULED: ["ONGOING", "CANCELLED"],
    ONGOING: ["COMPLETED"],
    COMPLETED: ["PUBLISHED"],
    PUBLISHED: [],
    CANCELLED: [],
  };

  try {
    const exam = await prisma.exam.findUnique({ where: { id: Number(id) } });
    if (!exam) return sendError(res, 404, "Exam not found");

    const newStatus = status.toUpperCase();
    if (!allowedTransitions[exam.status]?.includes(newStatus)) {
      return sendError(
        res,
        400,
        `Invalid status transition: ${exam.status} → ${newStatus}`,
        "INVALID_STATUS_TRANSITION",
      );
    }

    // Only ADMIN can move to COMPLETED or PUBLISHED
    if (
      ["COMPLETED", "PUBLISHED"].includes(newStatus) &&
      req.user.role !== "ADMIN"
    ) {
      return sendError(
        res,
        403,
        "Only Admin can mark as COMPLETED or PUBLISHED",
        "FORBIDDEN",
      );
    }

    const updated = await prisma.exam.update({
      where: { id: Number(id) },
      data: {
        status: newStatus,
        updatedById: req.user.id,
      },
      include: {
        term: { id: true, termName: true },
        classroom: true,
        subject: true,
      },
    });

    return sendSuccess(
      res,
      200,
      updated,
      `Exam status updated to ${newStatus}`,
    );
  } catch (err) {
    return sendError(res, 500, "Failed to update exam status");
  }
};
