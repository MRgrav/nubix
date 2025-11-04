import prisma from '../models/prisma.js';

// Basic CRUD for Subject (now optionally linked to a School)
export const createSubject = async (req, res) => {
  try {
    const { name, code, description, schoolId } = req.body;
    const existing = await prisma.subject.findUnique({ where: { code } });
    if (existing) return res.status(400).json({ error: 'Subject code already exists' });

    const data = { name, code, description };
    if (schoolId) data.school = { connect: { id: parseInt(schoolId) } };

    const subject = await prisma.subject.create({
      data,
      include: { school: { select: { id: true, name: true, schoolCode: true } } }
    });

    res.status(201).json(subject);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create subject' });
  }
};

export const getSubjects = async (req, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      orderBy: { name: 'asc' },
      include: { school: { select: { id: true, name: true, schoolCode: true } } }
    });
    res.json({ subjects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
};

export const getSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await prisma.subject.findUnique({
      where: { id: parseInt(id) },
      include: { school: { select: { id: true, name: true, schoolCode: true } } }
    });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    res.json(subject);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subject' });
  }
};

export const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, schoolId } = req.body;
    const data = { name, code, description };
    if (schoolId === null) {
      data.school = { disconnect: true };
    } else if (schoolId !== undefined) {
      data.school = { connect: { id: parseInt(schoolId) } };
    }

    const subject = await prisma.subject.update({
      where: { id: parseInt(id) },
      data,
      include: { school: { select: { id: true, name: true, schoolCode: true } } }
    });
    res.json(subject);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Subject not found' });
    res.status(500).json({ error: 'Failed to update subject' });
  }
};

export const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.subject.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Subject deleted' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Subject not found' });
    res.status(500).json({ error: 'Failed to delete subject' });
  }
};
