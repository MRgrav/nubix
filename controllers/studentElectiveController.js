// controllers/studentElectiveController.js
import prisma from "../models/prisma.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";
import { validateElectives } from "../utils/studentUtils.js";

// POST /students/:studentId/electives
// Body: { curriculumSubjectIds: [1, 2, 3] }
export const requestElectives = async (req, res) => {
  const { studentId } = req.params;
  const { curriculumSubjectIds } = req.body;

  if (!Array.isArray(curriculumSubjectIds) || !curriculumSubjectIds.length) {
    return sendError(
      res,
      400,
      "curriculumSubjectIds must be a non-empty array",
      "VALIDATION_ERROR",
    );
  }

  try {
    const valid = await validateElectives(
      parseInt(studentId),
      curriculumSubjectIds,
    );
    if (!valid) {
      return sendError(
        res,
        400,
        "One or more subjects are not valid electives for this student",
        "INVALID_ELECTIVE",
      );
    }

    const enrollment = await prisma.studentStream.findFirst({
      where: {
        studentId: parseInt(studentId),
        academicYear: { isActive: true },
      },
      select: { academicYearId: true },
    });

    if (!enrollment) return sendError(res, 404, "No active enrollment found");

    await prisma.studentElectiveChoice.createMany({
      data: curriculumSubjectIds.map((id) => ({
        studentId: parseInt(studentId),
        academicYearId: enrollment.academicYearId,
        curriculumSubjectId: id,
        status: "PENDING",
      })),
      skipDuplicates: true,
    });

    return sendSuccess(
      res,
      201,
      null,
      "Elective subjects requested (pending approval)",
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to request electives", "INTERNAL_ERROR");
  }
};

// POST /students/:studentId/electives/:electiveChoiceId/approve
export const approveElective = async (req, res) => {
  const { studentId, electiveChoiceId } = req.params;

  try {
    const updated = await prisma.studentElectiveChoice.updateMany({
      where: {
        id: parseInt(electiveChoiceId),
        studentId: parseInt(studentId),
        status: "PENDING",
      },
      data: {
        status: "APPROVED",
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return sendError(res, 404, "Elective request not found or not pending");
    }

    return sendSuccess(res, 200, null, "Elective approved successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to approve elective", "INTERNAL_ERROR");
  }
};

// POST /students/:studentId/electives/:electiveChoiceId/reject
export const rejectElective = async (req, res) => {
  const { studentId, electiveChoiceId } = req.params;

  try {
    const updated = await prisma.studentElectiveChoice.updateMany({
      where: {
        id: parseInt(electiveChoiceId),
        studentId: parseInt(studentId),
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return sendError(res, 404, "Elective request not found or not pending");
    }

    return sendSuccess(res, 200, null, "Elective rejected");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to reject elective", "INTERNAL_ERROR");
  }
};

// DELETE /students/:studentId/electives/:curriculumSubjectId
export const dropElective = async (req, res) => {
  const { studentId, curriculumSubjectId } = req.params;

  try {
    const deleted = await prisma.studentElectiveChoice.updateMany({
      where: {
        studentId: parseInt(studentId),
        curriculumSubjectId: parseInt(curriculumSubjectId),
        status: { in: ["PENDING", "APPROVED"] },
      },
      data: {
        status: "DROPPED",
      },
    });

    if (deleted.count === 0) {
      return sendError(res, 404, "Elective not found or already dropped");
    }

    return sendSuccess(res, 200, null, "Elective dropped successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to drop elective", "INTERNAL_ERROR");
  }
};

// GET /students/:studentId/available-electives
export const getAvailableElectives = async (req, res) => {
  const { studentId } = req.params;

  try {
    const enrollment = await prisma.studentStream.findFirst({
      where: {
        studentId: parseInt(studentId),
        academicYear: { isActive: true },
      },
      include: { classroom: true, stream: true },
    });

    if (!enrollment) return sendError(res, 404, "No active enrollment found");

    const className = enrollment.classroom.name
      .trim()
      .replace(/^Class\s+/i, "");

    // Already chosen/pending electives
    const existing = await prisma.studentElectiveChoice.findMany({
      where: {
        studentId: parseInt(studentId),
        academicYearId: enrollment.academicYearId,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: { curriculumSubjectId: true },
    });

    const existingIds = existing.map((e) => e.curriculumSubjectId);

    const available = await prisma.curriculumSubject.findMany({
      where: {
        academicYearId: enrollment.academicYearId,
        className,
        category: { in: ["ELECTIVE", "ACTIVITY"] },
        id: { notIn: existingIds },
        OR: [{ streamId: enrollment.streamId }, { streamId: null }],
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
      },
    });

    return sendSuccess(res, 200, available, "Available electives fetched");
  } catch (err) {
    console.error(err);
    return sendError(
      res,
      500,
      "Failed to fetch available electives",
      "INTERNAL_ERROR",
    );
  }
};
