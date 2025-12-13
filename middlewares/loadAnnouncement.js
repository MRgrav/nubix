import prisma from "../models/prisma.js";

export const loadAnnouncement = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next();

    const announcement = await prisma.announcement.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    req.announcement = announcement;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load announcement" });
  }
};
