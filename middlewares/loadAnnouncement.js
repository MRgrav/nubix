import prisma from "../models/prisma.js";
import { sendError } from "../utils/responseStructure.js";

export const loadAnnouncement = async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, 400, "Announcement ID is required", "MISSING_ID");
  }

  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: Number(id) },
      include: {
        createdBy: { select: { id: true, email: true, role: true } },
        academicYear: { select: { id: true, label: true } },
        stream: true,
        classroom: true,
        documents: true,
      },
    });

    if (!announcement) {
      return sendError(res, 404, "Announcement not found", "NOT_FOUND");
    }

    req.announcement = announcement;
    next();
  } catch (err) {
    console.error("Error loading announcement:", err);
    return sendError(res, 500, "Failed to load announcement", "INTERNAL_ERROR");
  }
};
