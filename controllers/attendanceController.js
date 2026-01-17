import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";

// Mark attendance for student
export const markStudentAttendance = async (req, res) => {
  try {
    const { studentId, date, status, note, academicYearId } = req.body;
    if (!studentId || !status) {
      return res
        .status(400)
        .json({ error: "studentId and status are required" });
    }

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear)
        return res.status(400).json({ error: "No active academic year found" });
      resolvedAcademicYearId = activeYear.id;
    }

    const attendanceDate = date ? new Date(date) : new Date();

    const attendance = await prisma.attendance.create({
      data: {
        date: attendanceDate,
        status,
        note,
        student: { connect: { id: parseInt(studentId) } },
        academicYear: { connect: { id: parseInt(resolvedAcademicYearId) } },
      },
      include: { academicYear: { select: { id: true, label: true } } },
    });

    res.status(201).json(attendance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark student attendance" });
  }
};

export const getStudentAttendance = async (req, res) => {
  try {
    const { studentId, from, to, academicYearId } = req.query;
    if (!studentId)
      return res.status(400).json({ error: "studentId is required" });

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      resolvedAcademicYearId = activeYear?.id;
    }

    const where = {
      studentId: parseInt(studentId),
      ...(resolvedAcademicYearId && {
        academicYearId: parseInt(resolvedAcademicYearId),
      }),
    };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: { academicYear: { select: { id: true, label: true } } },
      orderBy: { date: "desc" },
    });

    res.json({ attendances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch student attendance" });
  }
};

export const updateStudentAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, date, note, academicYearId } = req.body;

    const data = {};
    if (status !== undefined) data.status = status;
    if (date) data.date = new Date(date);
    if (note !== undefined) data.note = note;
    if (academicYearId)
      data.academicYear = { connect: { id: parseInt(academicYearId) } };

    const attendance = await prisma.attendance.update({
      where: { id: parseInt(id) },
      data,
      include: { academicYear: true },
    });

    res.json(attendance);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Attendance not found" });
    res.status(500).json({ error: "Failed to update attendance" });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.attendance.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Attendance deleted" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Attendance not found" });
    res.status(500).json({ error: "Failed to delete attendance" });
  }
};

// Staff attendance (reuse same model)
export const markStaffAttendance = async (req, res) => {
  try {
    const { staffId, date, status, note, academicYearId } = req.body;
    if (!staffId || !status) {
      return res.status(400).json({ error: "staffId and status are required" });
    }

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear)
        return res.status(400).json({ error: "No active academic year found" });
      resolvedAcademicYearId = activeYear.id;
    }

    const attendanceDate = date ? new Date(date) : new Date();

    const attendance = await prisma.attendance.create({
      data: {
        date: attendanceDate,
        status,
        note,
        staff: { connect: { id: parseInt(staffId) } },
        academicYear: { connect: { id: parseInt(resolvedAcademicYearId) } },
      },
      include: { academicYear: { select: { id: true, label: true } } },
    });

    res.status(201).json(attendance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark staff attendance" });
  }
};

export const getStaffAttendance = async (req, res) => {
  try {
    const { staffId, from, to, academicYearId } = req.query;
    if (!staffId) return res.status(400).json({ error: "staffId is required" });

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      resolvedAcademicYearId = activeYear?.id;
    }

    const where = {
      staffId: parseInt(staffId),
      ...(resolvedAcademicYearId && {
        academicYearId: parseInt(resolvedAcademicYearId),
      }),
    };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: { academicYear: { select: { id: true, label: true } } },
      orderBy: { date: "desc" },
    });

    res.json({ attendances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch staff attendance" });
  }
};
