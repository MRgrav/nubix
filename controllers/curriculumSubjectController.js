import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";

// Helper to standardize class name (uppercase, remove prefix)
const standardizeClassName = (className) => {
  return className
    .trim()
    .toUpperCase()
    .replace(/^CLASS\s*/i, "");
};

// Helper to extract class number for validation
const extractClassNumber = (className) => {
  const match = className.match(/(\d{1,2})/);
  return match ? parseInt(match[0]) : null;
};

export const createCurriculumSubject = async (req, res) => {
  const {
    academicYearId,
    className,
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
      "VALIDATION_ERROR"
    );
  }
  if (!className?.trim() || !subjectId || !category) {
    return sendError(
      res,
      400,
      "className, subjectId, and category are required",
      "VALIDATION_ERROR"
    );
  }

  const standardizedClassName = standardizeClassName(className);
  const classNumber = extractClassNumber(standardizedClassName);

  // Restrict stream only to Class 11 & 12
  if (streamId && (!classNumber || ![11, 12].includes(classNumber))) {
    return sendError(
      res,
      400,
      "streamId is only allowed for Class 11 or 12",
      "INVALID_STREAM_SCOPE"
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
          "NOT_FOUND"
        );
      }
      resolvedAcademicYearId = activeYear.id;
    }

    // Pre-check for duplicates with scoping via academicYear.schoolId
    const existing = await prisma.curriculumSubject.findFirst({
      where: {
        academicYearId: resolvedAcademicYearId,
        className: standardizedClassName,
        subjectId: parseInt(subjectId),
        streamId: streamId ? parseInt(streamId) : null,
        schoolId,
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        stream: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (existing) {
      return sendError(
        res,
        409,
        "This subject is already assigned to this class",
        "DUPLICATE_ENTRY",
        {
          className: existing.className,
          subject: {
            id: existing.subject.id,
            name: existing.subject.name,
            code: existing.subject.code,
          },
          stream: existing.stream
            ? {
                id: existing.stream.id,
                name: existing.stream.name,
              }
            : null,
        }
      );
    }

    const curriculumSubject = await prisma.curriculumSubject.create({
      data: {
        academicYear: { connect: { id: resolvedAcademicYearId } },
        className: standardizedClassName,
        subject: { connect: { id: parseInt(subjectId) } },
        stream: streamId ? { connect: { id: parseInt(streamId) } } : undefined,
        category,
        isMandatory,
        school: { connect: { id: schoolId } },
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        stream: { select: { id: true, name: true } },
        academicYear: { select: { id: true, label: true } },
      },
    });

    return sendSuccess(
      res,
      201,
      curriculumSubject,
      "Subject added to curriculum successfully"
    );
  } catch (err) {
    console.error(err);

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "This subject is already assigned to this class/stream/year",
        "DUPLICATE_ENTRY"
      );
    }

    if (err.code === "P2025") {
      return sendError(
        res,
        404,
        "Academic year, subject, or stream not found",
        "NOT_FOUND"
      );
    }

    return sendError(
      res,
      500,
      "Failed to assign subject to curriculum",
      "INTERNAL_ERROR"
    );
  }
};

export const getCurriculumSubjects = async (req, res) => {
  const {
    academicYearId,
    className,
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
      "VALIDATION_ERROR"
    );
  }

  try {
    const where = { schoolId };
    if (academicYearId) where.academicYearId = parseInt(academicYearId);
    if (className) where.className = standardizeClassName(className);
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
          academicYear: { select: { id: true, label: true } },
        },
        orderBy: [{ className: "asc" }, { subject: { name: "asc" } }],
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
      }
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch", "INTERNAL_ERROR");
  }
};

// Additional useful endpoints
export const updateCurriculumSubject = async (req, res) => {
  const { id } = req.params;
  const { category, isMandatory, streamId, className } = req.body;
  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "School context is required",
      "VALIDATION_ERROR"
    );
  }
  if (Object.keys(req.body).length === 0) {
    return sendError(res, 400, "No update data provided", "VALIDATION_ERROR");
  }

  try {
    const data = {};
    let standardizedClassName;
    if (className) {
      standardizedClassName = standardizeClassName(className);
      data.className = standardizedClassName;
    }
    if (category) data.category = category;
    if (isMandatory !== undefined) data.isMandatory = isMandatory;

    if (streamId !== undefined || standardizedClassName) {
      // Re-validate stream if class or stream changes
      const existing = await prisma.curriculumSubject.findUnique({
        where: { id: parseInt(id) },
        select: { className: true },
      });
      const classNum = extractClassNumber(
        standardizedClassName || existing.className
      );
      if (streamId && (!classNum || ![11, 12].includes(classNum))) {
        return sendError(
          res,
          400,
          "Invalid stream for class",
          "INVALID_STREAM_SCOPE"
        );
      }
      if (streamId === null) {
        data.stream = { disconnect: true };
      } else if (streamId) {
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
      },
    });

    return sendSuccess(res, 200, updated, "Updated successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return sendError(res, 404, "Not found", "NOT_FOUND");
    if (err.code === "P2002")
      return sendError(res, 409, "Duplicate after update", "DUPLICATE_ENTRY");
    return sendError(res, 500, "Failed to update", "INTERNAL_ERROR");
  }
};

export const deleteCurriculumSubject = async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "School context is required",
      "VALIDATION_ERROR"
    );
  }

  try {
    await prisma.curriculumSubject.delete({
      where: { id: parseInt(id), schoolId },
    });
    return sendSuccess(res, 200, null, "Deleted successfully");
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return sendError(res, 404, "Not found", "NOT_FOUND");
    return sendError(res, 500, "Failed to delete", "INTERNAL_ERROR");
  }
};

export const getSubjectsForClass = async (req, res) => {
  const { className, academicYearId, streamId } = req.query;
  const schoolId = req.user?.schoolId;

  if (!schoolId) {
    return sendError(
      res,
      400,
      "School context is required",
      "VALIDATION_ERROR"
    );
  }
  if (!className || !academicYearId) {
    return sendError(
      res,
      400,
      "className and academicYearId required",
      "VALIDATION_ERROR"
    );
  }

  try {
    const subjects = await prisma.curriculumSubject.findMany({
      where: {
        className: standardizeClassName(className),
        academicYearId: parseInt(academicYearId),
        ...(streamId && { streamId: parseInt(streamId) }),
        schoolId, // Scoped
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        stream: { select: { id: true, name: true } },
      },
      orderBy: { subject: { name: "asc" } },
    });

    return sendSuccess(res, 200, subjects, "Fetched successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch", "INTERNAL_ERROR");
  }
};
