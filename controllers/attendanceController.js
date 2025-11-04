import prisma from '../models/prisma.js';

// Mark attendance for student
export const markStudentAttendance = async (req, res) => {
  try {
    const { studentId, date, status, note } = req.body;
    if (!studentId || !status) {
      return res.status(400).json({ error: 'studentId and status are required' });
    }

    const attendanceDate = date ? new Date(date) : new Date();

    const attendance = await prisma.attendance.create({
      data: {
        date: attendanceDate,
        status,
        note,
        student: { connect: { id: parseInt(studentId) } }
      }
    });

    res.status(201).json(attendance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark student attendance' });
  }
};

export const getStudentAttendance = async (req, res) => {
  try {
    const { studentId, from, to } = req.query;
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const where = { studentId: parseInt(studentId) };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const attendances = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    res.json({ attendances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch student attendance' });
  }
};

export const updateStudentAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, date, note } = req.body;

    const data = {};
    if (status !== undefined) data.status = status;
    if (date) data.date = new Date(date);
    if (note !== undefined) data.note = note;

    const attendance = await prisma.attendance.update({
      where: { id: parseInt(id) },
      data
    });

    res.json(attendance);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Attendance not found' });
    res.status(500).json({ error: 'Failed to update attendance' });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.attendance.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Attendance deleted' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Attendance not found' });
    res.status(500).json({ error: 'Failed to delete attendance' });
  }
};

// Staff attendance (reuse same model)
export const markStaffAttendance = async (req, res) => {
  try {
    const { staffId, date, status, note } = req.body;
    if (!staffId || !status) {
      return res.status(400).json({ error: 'staffId and status are required' });
    }

    const attendanceDate = date ? new Date(date) : new Date();

    const attendance = await prisma.attendance.create({
      data: {
        date: attendanceDate,
        status,
        note,
        staff: { connect: { id: parseInt(staffId) } }
      }
    });

    res.status(201).json(attendance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark staff attendance' });
  }
};

export const getStaffAttendance = async (req, res) => {
  try {
    const { staffId, from, to } = req.query;
    if (!staffId) return res.status(400).json({ error: 'staffId is required' });

    const where = { staffId: parseInt(staffId) };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const attendances = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    res.json({ attendances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch staff attendance' });
  }
};
