import prisma from "../models/prisma.js";

const parseTimeToMinutes = (t) => {
  if (!t || typeof t !== "string") return null;
  const s = t.trim();
  const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

export const createSlot = async (req, res) => {
  const {
    schoolId,
    schoolCode,
    classroomId,
    day,
    slotType,
    startTime,
    endTime,
    academicYear,
    subjectId,
    teacherId,
    notes,
  } = req.body;
  try {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null) {
      return res.status(400).json({ error: "Invalid time format HH:mm" });
    }
    if (endMinutes <= startMinutes) {
      return res
        .status(400)
        .json({ error: "End time must be after start time" });
    }

    let resolvedSchoolId;
    if (schoolCode) {
      const code = String(schoolCode).trim();
      var school = await prisma.school.findUnique({
        where: { schoolCode: code },
      });
      if (!school) return res.status(404).json({ error: "School not found" });
      resolvedSchoolId = school.id;
    } else if (schoolId) {
      const sid = String(schoolId);
      if (sid.length === 4 && sid.startsWith("0")) {
        var school = await prisma.school.findUnique({
          where: { schoolCode: sid },
        });
        if (!school) return res.status(404).json({ error: "School not found" });
        resolvedSchoolId = school.id;
      } else {
        var school = await prisma.school.findUnique({
          where: { id: parseInt(schoolId) },
        });
        if (!school) return res.status(404).json({ error: "School not found" });
        resolvedSchoolId = school.id;
      }
    } else {
      return res
        .status(400)
        .json({ error: "Either schoolId or schoolCode is required" });
    }
    if (!school) return res.status(404).json({ error: "School not found" });

    const classroom = await prisma.classroom.findUnique({
      where: { id: parseInt(classroomId) },
    });
    if (!classroom)
      return res.status(404).json({ error: "Classroom not found" });

    if (subjectId) {
      const subj = await prisma.subject.findUnique({
        where: { id: parseInt(subjectId) },
      });
      if (!subj) return res.status(404).json({ error: "Subject not found" });
    }
    if (teacherId) {
      const teacher = await prisma.staff.findUnique({
        where: { id: parseInt(teacherId) },
      });
      if (!teacher) return res.status(404).json({ error: "Teacher not found" });
    }

    const overlaps = await prisma.timetableSlot.findFirst({
      where: {
        schoolId: resolvedSchoolId,
        classroomId: parseInt(classroomId),
        day,
        academicYear,
        OR: [
          {
            AND: [
              { startMinutes: { lte: startMinutes } },
              { endMinutes: { gt: startMinutes } },
            ],
          },
          {
            AND: [
              { startMinutes: { lt: endMinutes } },
              { endMinutes: { gte: endMinutes } },
            ],
          },
          {
            AND: [
              { startMinutes: { gte: startMinutes } },
              { endMinutes: { lte: endMinutes } },
            ],
          },
        ],
      },
    });
    if (overlaps) {
      return res
        .status(409)
        .json({ error: "Time slot overlaps with existing slot" });
    }

    const slot = await prisma.timetableSlot.create({
      data: {
        school: { connect: { id: resolvedSchoolId } },
        classroom: { connect: { id: parseInt(classroomId) } },
        day,
        slotType,
        startMinutes,
        endMinutes,
        academicYear,
        subject: subjectId
          ? { connect: { id: parseInt(subjectId) } }
          : undefined,
        teacher: teacherId
          ? { connect: { id: parseInt(teacherId) } }
          : undefined,
        notes: notes || undefined,
      },
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(slot);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res
        .status(404)
        .json({ error: err.meta?.cause || "Related record not found" });
    }
    res.status(500).json({ error: "Failed to create slot" });
  }
};

export const getSlots = async (req, res) => {
  const { schoolId, schoolCode, schoolcode, classroomId, day, academicYear } =
    req.query;
  try {
    const where = {};
    const sc = schoolCode ?? schoolcode;
    if (sc) {
      where.school = { is: { schoolCode: String(sc).trim() } };
    } else if (schoolId) {
      const sid = String(schoolId);
      if (sid.length === 4 && sid.startsWith("0")) {
        where.school = { is: { schoolCode: sid } };
      } else {
        where.schoolId = parseInt(schoolId);
      }
    }
    if (classroomId) where.classroomId = parseInt(classroomId);
    if (day) where.day = day;
    if (academicYear) where.academicYear = academicYear;

    const slots = await prisma.timetableSlot.findMany({
      where,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
      },
      orderBy: [{ day: "asc" }, { startMinutes: "asc" }],
    });

    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch slots" });
  }
};

export const updateSlot = async (req, res) => {
  const { id } = req.params;
  const {
    slotType,
    startTime,
    endTime,
    subjectId,
    teacherId,
    notes,
    day,
    academicYear,
  } = req.body;
  try {
    const data = {};
    if (slotType) data.slotType = slotType;
    if (day) data.day = day;
    if (academicYear) data.academicYear = academicYear;
    if (startTime) {
      const m = parseTimeToMinutes(startTime);
      if (m === null)
        return res.status(400).json({ error: "Invalid start time HH:mm" });
      data.startMinutes = m;
    }
    if (endTime) {
      const m = parseTimeToMinutes(endTime);
      if (m === null)
        return res.status(400).json({ error: "Invalid end time HH:mm" });
      data.endMinutes = m;
    }
    if (
      data.startMinutes !== undefined &&
      data.endMinutes !== undefined &&
      data.endMinutes <= data.startMinutes
    ) {
      return res
        .status(400)
        .json({ error: "End time must be after start time" });
    }
    if (subjectId !== undefined)
      data.subject = subjectId
        ? { connect: { id: parseInt(subjectId) } }
        : { disconnect: true };
    if (teacherId !== undefined)
      data.teacher = teacherId
        ? { connect: { id: parseInt(teacherId) } }
        : { disconnect: true };
    if (notes !== undefined) data.notes = notes || null;

    const slot = await prisma.timetableSlot.update({
      where: { id: parseInt(id) },
      data,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
      },
    });

    res.json(slot);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Slot not found" });
    res.status(500).json({ error: "Failed to update slot" });
  }
};

export const deleteSlot = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.timetableSlot.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Slot deleted" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Slot not found" });
    res.status(500).json({ error: "Failed to delete slot" });
  }
};

// TODO: Updated Codes
// import prisma from '../models/prisma.js';
// import { getActiveAcademicYear } from '../utils/academicYearHelper.js';

// export const createSlot = async (req, res) => {
//   const { day, slotType, startMinutes, endMinutes, notes, schoolId, classroomId, subjectId, teacherId, academicYearId } = req.body;
//   try {
//     let resolvedAcademicYearId = academicYearId;
//     if (!resolvedAcademicYearId) {
//       const activeYear = await getActiveAcademicYear(parseInt(schoolId));
//       if (!activeYear) return res.status(400).json({ error: "No active academic year" });
//       resolvedAcademicYearId = activeYear.id;
//     }

//     const slot = await prisma.timetableSlot.create({
//       data: {
//         day, slotType, startMinutes, endMinutes, notes,
//         school: { connect: { id: parseInt(schoolId) } },
//         classroom: { connect: { id: parseInt(classroomId) } },
//         subject: subjectId ? { connect: { id: parseInt(subjectId) } } : undefined,
//         teacher: teacherId ? { connect: { id: parseInt(teacherId) } } : undefined,
//         academicYear: { connect: { id: parseInt(resolvedAcademicYearId) } },
//       },
//       include: { school: true, classroom: true, subject: true, teacher: true, academicYear: true },
//     });
//     res.status(201).json(slot);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Failed to create slot' });
//   }
// };

// export const getSlots = async (req, res) => {
//   const { schoolId, classroomId, day, academicYearId } = req.query;
//   try {
//     let resolvedAcademicYearId = academicYearId;
//     if (!resolvedAcademicYearId && schoolId) {
//       const activeYear = await getActiveAcademicYear(parseInt(schoolId));
//       resolvedAcademicYearId = activeYear?.id;
//     }

//     const where = { ...(resolvedAcademicYearId && { academicYearId: parseInt(resolvedAcademicYearId) }) };
//     if (schoolId) where.schoolId = parseInt(schoolId);
//     if (classroomId) where.classroomId = parseInt(classroomId);
//     if (day) where.day = day;

//     const slots = await prisma.timetableSlot.findMany({
//       where,
//       include: { school: true, classroom: true, subject: true, teacher: true, academicYear: true },
//       orderBy: { startMinutes: 'asc' },
//     });
//     res.json({ slots });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Failed to fetch slots' });
//   }
// };

// export const updateSlot = async (req, res) => {
//   const { id } = req.params;
//   const updates = req.body;
//   try {
//     if (updates.subjectId) updates.subject = { connect: { id: parseInt(updates.subjectId) } }; delete updates.subjectId;
//     if (updates.teacherId) updates.teacher = { connect: { id: parseInt(updates.teacherId) } }; delete updates.teacherId;
//     if (updates.schoolId) updates.school = { connect: { id: parseInt(updates.schoolId) } }; delete updates.schoolId;
//     if (updates.classroomId) updates.classroom = { connect: { id: parseInt(updates.classroomId) } }; delete updates.classroomId;
//     if (updates.academicYearId) updates.academicYear = { connect: { id: parseInt(updates.academicYearId) } }; delete updates.academicYearId;

//     const slot = await prisma.timetableSlot.update({
//       where: { id: parseInt(id) },
//       data: updates,
//       include: { academicYear: true },
//     });
//     res.json(slot);
//   } catch (err) {
//     console.error(err);
//     if (err.code === 'P2025') return res.status(404).json({ error: 'Slot not found' });
//     res.status(500).json({ error: 'Failed to update slot' });
//   }
// };

// export const deleteSlot = async (req, res) => {
//   const { id } = req.params;
//   try {
//     await prisma.timetableSlot.delete({ where: { id: parseInt(id) } });
//     res.json({ message: 'Slot deleted' });
//   } catch (err) {
//     console.error(err);
//     if (err.code === 'P2025') return res.status(404).json({ error: 'Slot not found' });
//     res.status(500).json({ error: 'Failed to delete slot' });
//   }
// };
