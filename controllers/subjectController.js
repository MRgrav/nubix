import prisma from "../models/prisma.js";

export const createSubject = async (req, res) => {
  const { name, code, description, schoolId } = req.body;

  // Basic validation
  if (!name?.trim() || !code?.trim()) {
    return res.status(400).json({ error: "name and code are required" });
  }

  try {
    let connectSchool = undefined;
    if (schoolId) {
      const schoolExists = await prisma.school.findUnique({
        where: { id: parseInt(schoolId) },
      });
      if (!schoolExists) {
        return res.status(404).json({ error: "School not found" });
      }
      connectSchool = { connect: { id: parseInt(schoolId) } };
    } else if (req.user.schoolId) {
      // Optionally enforce from user context if no schoolId provided
      connectSchool = { connect: { id: req.user.schoolId } };
    }
    const subject = await prisma.subject.create({
      data: {
        name: name.trim(),
        code: code.trim(),
        description: description?.trim(),
        school: connectSchool,
      },
    });
    res.status(201).json(subject);
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Code already exists" });
    }
    if (err.code === "P2025") {
      return res
        .status(404)
        .json({ error: "Invalid relation (e.g., school not found)" });
    }
    res.status(500).json({ error: "Failed to create subject" });
  }
};

export const getSubjects = async (req, res) => {
  const { schoolId, page = 1, limit = 100 } = req.query;

  try {
    const where = schoolId ? { schoolId: parseInt(schoolId) } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [total, subjects] = await prisma.$transaction([
      prisma.subject.count({ where }),
      prisma.subject.findMany({
        where,
        // include: { school: true, teachers: true, students: true },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
    ]);

    res.json({
      subjects,
      pagination: {
        total,
        pages: Math.ceil(total / take),
        currentPage: parseInt(page),
        perPage: take,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
};

export const getSubject = async (req, res) => {
  const { id } = req.params;
  try {
    const subject = await prisma.subject.findUnique({
      where: { id: parseInt(id) },
      // include: {
      //   school: true,
      //   teachers: true,
      //   students: true,
      //   timetableSlots: true,
      // },
    });
    if (!subject) return res.status(404).json({ error: "Subject not found" });
    res.json(subject);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subject" });
  }
};

export const updateSubject = async (req, res) => {
  const { id } = req.params;
  const { name, code, description, schoolId } = req.body;
  try {
    const data = {};
    if (name?.trim()) data.name = name.trim();
    if (code?.trim()) data.code = code.trim();
    if (description !== undefined) data.description = description?.trim();
    if (schoolId) {
      const schoolExists = await prisma.school.findUnique({
        where: { id: parseInt(schoolId) },
      });
      if (!schoolExists) {
        return res.status(404).json({ error: "School not found" });
      }
      data.school = { connect: { id: parseInt(schoolId) } };
    }

    const subject = await prisma.subject.update({
      where: { id: parseInt(id) },
      data,
      // include: { school: true, teachers: true, students: true },
    });
    res.json(subject);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Subject not found" });
    }
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Code already exists" });
    }
    res.status(500).json({ error: "Failed to update subject" });
  }
};

export const deleteSubject = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.subject.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Subject deleted" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Subject not found" });
    }
    res.status(500).json({ error: "Failed to delete subject" });
  }
};
