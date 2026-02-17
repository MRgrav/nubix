import prisma from "../models/prisma.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";

export const createStream = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name?.trim()) {
      return sendError(res, 400, "Stream name is required", "VALIDATION_ERROR");
    }

    const normalizedName = name.trim();

    // Prevent duplicate name per school
    const existing = await prisma.stream.findFirst({
      where: {
        name: normalizedName,
      },
    });

    if (existing) {
      return sendError(
        res,
        409,
        "Stream name already exists in this school",
        "CONFLICT",
      );
    }

    const stream = await prisma.stream.create({
      data: { name, description },
      include: { studentStreams: true },
    });
    return sendSuccess(res, 201, stream, "Stream created successfully");
  } catch (err) {
    console.error("Create stream error:", err);

    if (err.code === "P2002") {
      return sendError(res, 409, "Stream name conflict", "CONFLICT");
    }

    return sendError(res, 500, "Failed to create stream", "INTERNAL_ERROR");
  }
};
// Create an endpoint to get only the streams
export const getOnlyStreams = async (req, res) => {
  try {
    const streamsDetails = await prisma.stream.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return sendSuccess(
      res,
      200,
      streamsDetails,
      "Streams fetched successfully",
    );
  } catch (error) {
    console.error(error);
    return sendError(res, 500, "Failed to fetch streams");
  }
};

export const getStreams = async (req, res) => {
  const { page = 1, limit = 60 } = req.query;
  try {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const total = await prisma.stream.count();

    const streams = await prisma.stream.findMany({
      skip,
      take: limitNum,
      include: { studentStreams: { include: { student: true } } },
      orderBy: { name: "asc" },
    });

    const totalPages = Math.ceil(total / limitNum);

    return sendSuccess(res, 200, streams, "Streams fetched successfully", {
      pagination: {
        total,
        totalPages,
        currentPage: pageNum,
        perPage: limitNum,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (err) {
    console.error("Get streams error:", err);
    return sendError(res, 500, "Failed to fetch streams", "INTERNAL_ERROR");
  }
};

export const getStream = async (req, res) => {
  const { id } = req.params;
  try {
    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      include: {
        studentStreams: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
                classroomId: true,
                userId: true,
                schoolId: true,
              },
            },
            academicYear: {
              select: {
                id: true,
                label: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    if (!stream) {
      return sendError(res, 404, "Stream not found", "NOT_FOUND");
    }
    return sendSuccess(res, 200, stream, "Stream fetched successfully");
  } catch (err) {
    console.error("Get stream error:", err);
    return sendError(res, 500, "Failed to fetch stream", "INTERNAL_ERROR");
  }
};

export const updateStream = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const stream = await prisma.stream.update({
      where: { id: parseInt(id) },
      data: { name, description },
    });
    return sendSuccess(res, 200, stream, "Stream updated successfully");
  } catch (err) {
    console.error("Update stream error:", err);

    if (err.code === "P2025") {
      return sendError(res, 404, "Stream not found", "NOT_FOUND");
    }

    if (err.code === "P2002") {
      return sendError(res, 409, "Stream name conflict", "CONFLICT");
    }

    return sendError(res, 500, "Failed to update stream", "INTERNAL_ERROR");
  }
};

export const deleteStream = async (req, res) => {
  const { id } = req.params;
  try {
    const streamId = parseInt(id);
    if (isNaN(streamId)) {
      return sendError(res, 400, "Invalid stream ID", "INVALID_ID");
    }

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true, name: true },
    });

    if (!stream) {
      return sendError(res, 404, "Stream not found", "NOT_FOUND");
    }

    const hasStudents = await prisma.studentStream.findFirst({
      where: { streamId },
      select: { id: true },
    });

    if (hasStudents) {
      return sendError(
        res,
        409,
        "Cannot delete stream with enrolled students. Reassign students first.",
        "CONFLICT",
      );
    }

    await prisma.stream.delete({ where: { id: streamId } });

    return sendSuccess(res, 200, null, "Stream deleted successfully");
  } catch (err) {
    console.error("Delete stream error:", err);

    if (err.code === "P2025") {
      return sendError(res, 404, "Stream not found", "NOT_FOUND");
    }

    return sendError(res, 500, "Failed to delete stream", "INTERNAL_ERROR");
  }
};
