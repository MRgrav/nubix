import prisma from "../models/prisma.js";

/**
 * Request PTM (Parent ↔ Teacher)
 */
export const requestPTM = async (req, res) => {
  try {
    const {
      studentId,
      requestedToId,
      requestedDate,
      requestedTime,
      mode = "offline",
      purpose,
    } = req.body;

    const user = req.user;

    // Only STUDENT (Parent) or STAFF (Teacher)
    if (!["STUDENT", "STAFF"].includes(user.role)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const ptm = await prisma.pTMRequest.create({
      data: {
        studentId: student.id,
        class: student.grade ?? "",
        section: student.promotedToClass ?? "A",

        requestedById: user.id,
        requestedByRole: user.role, // STUDENT or STAFF

        requestedToId: Number(requestedToId),
        requestedToRole: user.role === "STAFF" ? "STUDENT" : "STAFF",

        requestedDate: new Date(requestedDate),
        requestedTime,
        mode,
        purpose,
      },
    });

    res.status(201).json(ptm);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to request PTM" });
  }
};

/**
 * Get my PTMs
 */
export const getMyPTMs = async (req, res) => {
  const userId = req.user.id;

  const ptms = await prisma.pTMRequest.findMany({
    where: {
      OR: [{ requestedById: userId }, { requestedToId: userId }],
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(ptms);
};

/**
 * Get PTM by ID
 */
export const getPTMById = async (req, res) => {
  const id = Number(req.params.id);

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Invalid PTM id" });
  }

  const ptm = await prisma.pTMRequest.findUnique({
    where: { id },
  });

  if (!ptm) {
    return res.status(404).json({ error: "PTM not found" });
  }

  const user = req.user;

  if (
    user.role !== "ADMIN" &&
    ptm.requestedById !== user.id &&
    ptm.requestedToId !== user.id
  ) {
    return res.status(403).json({ error: "Access denied" });
  }

  res.json(ptm);
};

/**
 * Approve PTM
 */
export const approvePTM = async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Invalid PTM id" });
  }

  const ptm = await prisma.pTMRequest.findUnique({ where: { id } });
  if (!ptm) return res.status(404).json({ error: "PTM not found" });

  const user = req.user;

  if (user.role !== "ADMIN" && ptm.requestedToId !== user.id) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const updated = await prisma.pTMRequest.update({
    where: { id },
    data: {
      status: "approved",
      responseById: user.id,
      responseByRole: user.role,
      responseDate: new Date(),
    },
  });

  res.json(updated);
};

/**
 * Postpone PTM
 */
export const postponePTM = async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Invalid PTM id" });
  }

  const { suggestedDate, suggestedTime } = req.body;
  const user = req.user;

  const ptm = await prisma.pTMRequest.findUnique({ where: { id } });
  if (!ptm) return res.status(404).json({ error: "PTM not found" });

  if (user.role !== "ADMIN" && ptm.requestedToId !== user.id) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const updated = await prisma.pTMRequest.update({
    where: { id },
    data: {
      status: "postponed",
      suggestedDate: new Date(suggestedDate),
      suggestedTime,
      responseById: user.id,
      responseByRole: user.role,
      responseDate: new Date(),
    },
  });

  res.json(updated);
};

/**
 * Reject PTM (Admin only)
 */
export const rejectPTM = async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Invalid PTM id" });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Only admin allowed" });
  }

  const updated = await prisma.pTMRequest.update({
    where: { id },
    data: {
      status: "rejected",
      responseById: req.user.id,
      responseByRole: req.user.role,
      responseDate: new Date(),
    },
  });

  res.json(updated);
};

/**
 * Admin: Get all PTMs
 */
export const getAllPTMs = async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Only admin allowed" });
  }

  const { status, teacher_id, class: className, section } = req.query;

  const where = {
    ...(status && { status }),
    ...(teacher_id && { requestedToId: Number(teacher_id) }),
    ...(className && { class: className }),
    ...(section && { section }),
  };

  const ptms = await prisma.pTMRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  res.json(ptms);
};
