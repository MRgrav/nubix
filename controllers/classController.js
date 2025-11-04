import prisma from '../models/prisma.js';

// CRUD for Class (named Classroom to avoid reserved word confusion)
export const createClassroom = async (req, res) => {
  try {
    const { name, schoolId } = req.body;
    const classroom = await prisma.classroom.create({
      data: {
        name,
        school: schoolId ? { connect: { id: parseInt(schoolId) } } : undefined
      }
    });
    res.status(201).json(classroom);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Failed to create class' });
  }
};

export const getClassrooms = async (req, res) => {
  try {
    const classrooms = await prisma.classroom.findMany({
      include: { school: { select: { id: true, name: true } }, students: true },
      orderBy: { name: 'asc' }
    });
    res.json({ classrooms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
};

export const getClassroom = async (req, res) => {
  try {
    const { id } = req.params;
    const classroom = await prisma.classroom.findUnique({
      where: { id: parseInt(id) },
      include: { students: true, school: true }
    });
    if (!classroom) return res.status(404).json({ error: 'Class not found' });
    res.json(classroom);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch class' });
  }
};

export const updateClassroom = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, schoolId } = req.body;
    const classroom = await prisma.classroom.update({
      where: { id: parseInt(id) },
      data: {
        name,
        school: schoolId ? { connect: { id: parseInt(schoolId) } } : undefined
      }
    });
    res.json(classroom);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Class not found' });
    res.status(500).json({ error: 'Failed to update class' });
  }
};

export const deleteClassroom = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.classroom.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Class deleted' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Class not found' });
    res.status(500).json({ error: 'Failed to delete class' });
  }
};

// Assign/Remove students to class
export const addStudentToClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentId } = req.body;
    // For single-class per student, update the student to set classroom
    const student = await prisma.student.update({
      where: { id: parseInt(studentId) },
      data: { classroom: { connect: { id: parseInt(classId) } } },
      include: { classroom: true }
    });
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add student to class' });
  }
};

export const removeStudentFromClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentId } = req.body;
    // For single-class per student, update the student to disconnect classroom
    const student = await prisma.student.update({
      where: { id: parseInt(studentId) },
      data: { classroom: { disconnect: true } },
      include: { classroom: true }
    });
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove student from class' });
  }
};
