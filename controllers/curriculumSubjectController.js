import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";

// Reuse or define this helper (already in your code, but included here for completeness)
function extractClassNumber(className) {
  if (!className) return null;

  // Handle common formats: "Class 11", "XI", "11", "Class XI", "Std 9", etc.
  const cleaned = className
    .trim()
    .toUpperCase()
    .replace(/^CLASS\s*/i, "")
    .replace(/^STD\s*/i, "")
    .replace(/^GRADE\s*/i, "");

  // Roman numerals → Arabic
  const romanToArabic = { XI: 11, XII: 12 };
  if (romanToArabic[cleaned]) return romanToArabic[cleaned];

  // Extract number
  const match = cleaned.match(/\d{1,2}/);
  return match ? parseInt(match[0]) : null;
}

export const createCurriculumSubject = async (req, res) => {
  const {
    academicYearId,
    classroomId,
    subjectId,
    streamId,
    category,
    isMandatory = true,
  } = req.body;

  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "School context is required",
      "VALIDATION_ERROR",
    );
  }

  if (!classroomId) {
    return sendError(res, 400, "classroomId is required", "VALIDATION_ERROR");
  }

  if (!subjectId || !category) {
    return sendError(
      res,
      400,
      "subjectId, and category are required",
      "VALIDATION_ERROR",
    );
  }

  try {
    let resolvedAcademicYearId = academicYearId
      ? parseInt(academicYearId)
      : null;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(schoolId);
      if (!activeYear) {
        return sendError(
          res,
          400,
          "No active academic year found",
          "NOT_FOUND",
        );
      }
      resolvedAcademicYearId = activeYear.id;
    }

    // ────────────────────────────────────────────────
    // NEW: Fetch classroom to check its class level
    // ────────────────────────────────────────────────
    const classroom = await prisma.classroom.findUnique({
      where: { id: parseInt(classroomId) },
      select: {
        id: true,
        name: true,
        schoolId: true,
      },
    });

    if (!classroom || classroom.schoolId !== schoolId) {
      return sendError(
        res,
        403,
        "Invalid or unauthorized classroom",
        "FORBIDDEN",
      );
    }

    // Extract numeric class level (e.g. "Class 11" → 11, "XI" → 11, "Class 9" → 9)
    const classLevel = extractClassNumber(classroom.name);

    if (classLevel && [11, 12].includes(classLevel) && !streamId) {
      return sendError(
        res,
        400,
        "Class 11 and 12 require a stream assignment",
        "MISSING_STREAM",
      );
    }

    // Enforce stream rule
    if (streamId) {
      // Stream is only allowed for Class 11 and 12
      if (!classLevel) {
        return sendError(
          res,
          400,
          "Cannot assign stream: classroom name does not contain a valid class number",
          "INVALID_CLASS_NAME_FORMAT",
        );
      }
      if (![11, 12].includes(classLevel)) {
        return sendError(
          res,
          400,
          `Stream can only be assigned to Class 11 or Class 12 (current classroom: ${classroom.name})`,
          "INVALID_STREAM_SCOPE",
        );
      }
    } else {
      // For classes 1–10, streamId must be null (optional but good to enforce)
      if (
        classLevel &&
        classLevel <= 10 &&
        streamId !== undefined &&
        streamId !== null
      ) {
        return sendError(
          res,
          400,
          "Classes 1 to 10 cannot have a stream assigned",
          "INVALID_STREAM_SCOPE",
        );
      }
    }

    // ────────────────────────────────────────────────
    // Duplicate check (now using classroomId)
    // ────────────────────────────────────────────────
    const existing = await prisma.curriculumSubject.findFirst({
      where: {
        academicYearId: resolvedAcademicYearId,
        classroomId: parseInt(classroomId),
        subjectId: parseInt(subjectId),
        streamId: streamId ? parseInt(streamId) : null,
        schoolId,
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        stream: { select: { id: true, name: true } },
        classroom: { select: { name: true, section: true } },
      },
    });

    if (existing) {
      return sendError(
        res,
        409,
        "This subject is already assigned to this classroom/stream/year",
        "DUPLICATE_ENTRY",
        {
          classroom: {
            id: existing.classroom.id,
            name: existing.classroom.name,
            section: existing.classroom.section,
          },
          subject: {
            id: existing.subject.id,
            name: existing.subject.name,
            code: existing.subject.code,
          },
          stream: existing.stream
            ? { id: existing.stream.id, name: existing.stream.name }
            : null,
        },
      );
    }

    const curriculumSubject = await prisma.curriculumSubject.create({
      data: {
        academicYear: { connect: { id: resolvedAcademicYearId } },
        classroom: { connect: { id: parseInt(classroomId) } },
        subject: { connect: { id: parseInt(subjectId) } },
        stream: streamId ? { connect: { id: parseInt(streamId) } } : undefined,
        category,
        isMandatory,
        school: { connect: { id: schoolId } },
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        stream: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true, section: true } },
        academicYear: { select: { id: true, label: true } },
      },
    });

    return sendSuccess(
      res,
      201,
      curriculumSubject,
      "Subject added to curriculum successfully",
    );
  } catch (err) {
    console.error("Create curriculum subject error:", err);

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Duplicate curriculum subject",
        "DUPLICATE_ENTRY",
      );
    }

    if (err.code === "P2025") {
      return sendError(
        res,
        404,
        "Academic year, classroom, subject, or stream not found",
        "NOT_FOUND",
      );
    }

    return sendError(
      res,
      500,
      "Failed to assign subject to curriculum",
      "INTERNAL_ERROR",
    );
  }
};

// ────────────────────────────────────────────────
// 2. Get curriculum subjects (now filtered by classroomId)
export const getCurriculumSubjects = async (req, res) => {
  const {
    academicYearId,
    classroomId, // ← primary filter instead of className
    streamId,
    category,
    subjectId,
    page = 1,
    limit = 20,
  } = req.query;

  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "School context is required",
      "VALIDATION_ERROR",
    );
  }

  try {
    const where = { schoolId };

    if (academicYearId) where.academicYearId = parseInt(academicYearId);
    if (classroomId) where.classroomId = parseInt(classroomId);
    if (streamId) where.streamId = parseInt(streamId);
    if (category) where.category = category;
    if (subjectId) where.subjectId = parseInt(subjectId);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [total, items] = await prisma.$transaction([
      prisma.curriculumSubject.count({ where }),
      prisma.curriculumSubject.findMany({
        where,
        include: {
          subject: { select: { id: true, name: true, code: true } },
          stream: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true, section: true } },
          academicYear: { select: { id: true, label: true } },
        },
        orderBy: [{ classroom: { name: "asc" } }, { subject: { name: "asc" } }],
        skip,
        take,
      }),
    ]);

    return sendSuccess(
      res,
      200,
      items,
      "Curriculum subjects fetched successfully",
      {
        total,
        pages: Math.ceil(total / take),
        currentPage: Number(page),
        perPage: take,
      },
    );
  } catch (err) {
    console.error("Get curriculum subjects error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch curriculum subjects",
      "INTERNAL_ERROR",
    );
  }
};

// ────────────────────────────────────────────────
// 3. Update curriculum subject
export const updateCurriculumSubject = async (req, res) => {
  const { id } = req.params;
  const { category, isMandatory, streamId, classroomId } = req.body;
  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "School context is required",
      "VALIDATION_ERROR",
    );
  }

  if (Object.keys(req.body).length === 0) {
    return sendError(res, 400, "No update data provided", "VALIDATION_ERROR");
  }

  try {
    const data = {};
    if (category) data.category = category;
    if (isMandatory !== undefined) data.isMandatory = isMandatory;

    // Handle classroom change
    if (classroomId !== undefined) {
      if (classroomId === null) {
        data.classroom = { disconnect: true };
      } else {
        // Validate classroom
        const cls = await prisma.classroom.findUnique({
          where: { id: parseInt(classroomId) },
          select: { id: true, schoolId: true },
        });
        if (!cls || cls.schoolId !== schoolId) {
          return sendError(
            res,
            403,
            "Invalid or unauthorized classroom",
            "FORBIDDEN",
          );
        }
        data.classroom = { connect: { id: parseInt(classroomId) } };
      }
    }

    // Handle stream change
    if (streamId !== undefined) {
      if (streamId === null) {
        data.stream = { disconnect: true };
      } else {
        data.stream = { connect: { id: parseInt(streamId) } };
      }
    }

    const updated = await prisma.curriculumSubject.update({
      where: { id: parseInt(id), schoolId },
      data,
      include: {
        academicYear: { select: { id: true, label: true } },
        subject: { select: { id: true, name: true, code: true } },
        stream: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true, section: true } },
      },
    });

    return sendSuccess(
      res,
      200,
      updated,
      "Curriculum subject updated successfully",
    );
  } catch (err) {
    console.error("Update curriculum subject error:", err);

    if (err.code === "P2025") {
      return sendError(res, 404, "Curriculum subject not found", "NOT_FOUND");
    }

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Duplicate assignment after update",
        "DUPLICATE_ENTRY",
      );
    }

    return sendError(
      res,
      500,
      "Failed to update curriculum subject",
      "INTERNAL_ERROR",
    );
  }
};

// ────────────────────────────────────────────────
// 4. Delete curriculum subject
export const deleteCurriculumSubject = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "School context is required",
      "VALIDATION_ERROR",
    );
  }

  try {
    await prisma.curriculumSubject.delete({
      where: { id: parseInt(id), schoolId },
    });

    return sendSuccess(
      res,
      200,
      null,
      "Curriculum subject deleted successfully",
    );
  } catch (err) {
    console.error("Delete curriculum subject error:", err);

    if (err.code === "P2025") {
      return sendError(res, 404, "Curriculum subject not found", "NOT_FOUND");
    }

    return sendError(
      res,
      500,
      "Failed to delete curriculum subject",
      "INTERNAL_ERROR",
    );
  }
};

// ────────────────────────────────────────────────
// 5. Get subjects for a specific classroom
export const getSubjectsForClass = async (req, res) => {
  const { classroomId, academicYearId, streamId } = req.query;
  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "School context is required",
      "VALIDATION_ERROR",
    );
  }

  if (!classroomId || !academicYearId) {
    return sendError(
      res,
      400,
      "classroomId and academicYearId are required",
      "VALIDATION_ERROR",
    );
  }

  try {
    const subjects = await prisma.curriculumSubject.findMany({
      where: {
        classroomId: parseInt(classroomId),
        academicYearId: parseInt(academicYearId),
        ...(streamId && { streamId: parseInt(streamId) }),
        schoolId,
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        stream: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true, section: true } },
        academicYear: { select: { id: true, label: true } },
      },
      orderBy: [{ subject: { name: "asc" } }],
    });

    return sendSuccess(
      res,
      200,
      subjects,
      "Subjects for classroom fetched successfully",
    );
  } catch (err) {
    console.error("Get subjects for classroom error:", err);
    return sendError(res, 500, "Failed to fetch subjects", "INTERNAL_ERROR");
  }
};
