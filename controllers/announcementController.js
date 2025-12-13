import prisma from "../models/prisma.js";

export const createAnnouncement = async (req, res) => {
  const {
    type,
    title,
    description,
    link,
    media,
    targetClass,
    targetSection,
    schoolId,
  } = req.body;

  if (!req.user?.userId) {
    return res.status(401).json({ error: "Invalid authentication context" });
  }

  try {
    const announcement = await prisma.announcement.create({
      data: {
        type,
        title,
        description,
        link,
        media,
        targetClass,
        targetSection,
        school: { connect: { id: parseInt(schoolId) } },
        createdBy: {
          connect: { id: req.user.id },
        },
        createdByRole: req.user.role,
      },
    });

    res.status(201).json(announcement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create announcement" });
  }
};

export const getAnnouncements = async (req, res) => {
  try {
    const { schoolId, type, class: targetClass, section } = req.query;
    const role = req.user.role;

    if (!schoolId) {
      return res.status(400).json({
        error: "schoolId is required",
      });
    }

    const where = {
      schoolId: parseInt(schoolId, 10),
    };

    if (type) {
      where.type = type;
    }

    // Students: visibility rules
    if (role === "STUDENT") {
      where.isSuspended = false;

      where.OR = [
        { targetClass: null },
        {
          targetClass,
          ...(section && { targetSection: section }),
        },
      ];
    }

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    res.json({ announcements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
};

export const getAnnouncement = async (req, res) => {
  res.json(req.announcement);
};

export const updateAnnouncement = async (req, res) => {
  const { title, description, link, media, targetClass, targetSection } =
    req.body;

  const updated = await prisma.announcement.update({
    where: { id: req.announcement.id },
    data: {
      title,
      description,
      link,
      media,
      targetClass,
      targetSection,
    },
  });

  res.json(updated);
};

export const deleteAnnouncement = async (req, res) => {
  await prisma.announcement.delete({
    where: { id: req.announcement.id },
  });

  res.json({ message: "Announcement deleted" });
};

export const suspendEvent = async (req, res) => {
  const announcement = req.announcement;

  if (announcement.type !== "event") {
    return res.status(400).json({ error: "Only events can be suspended" });
  }

  const updated = await prisma.announcement.update({
    where: { id: announcement.id },
    data: { isSuspended: true },
  });

  res.json(updated);
};
