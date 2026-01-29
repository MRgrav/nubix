import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import {
  getAcademicYearLabel,
  getAttendanceTableName,
  insertAttendance,
  queryAttendance,
  updateAttendance,
  deleteAttendanceRecord,
  attendanceExists,
  bulkInsertAttendance,
} from "../utils/attendanceTableHelper.js";

/**
 * Helper: Check if subject-wise attendance is required for a class
 * This checks at the class level, not per student
 */
const isSubjectWiseRequiredForClass = async (classroomId) => {
  if (!classroomId) return false;
  
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: {
      id: true,
      name: true,
      isSubjectWiseAttendance: true,
    },
  });

  return classroom?.isSubjectWiseAttendance || false;
};

// Helper to get student classroom ID
const getStudentClassroomId = async (studentId) => {
  const student = await prisma.student.findUnique({
    where: { id: parseInt(studentId) },
    select: { classroomId: true }
  });
  return student?.classroomId;
};

// Mark attendance for student
export const markStudentAttendance = async (req, res) => {
  try {
    const { studentId, date, status, note, academicYearId, subjectId } = req.body;
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

    // Get academic year label for table name
    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) {
      return res.status(400).json({ error: "Academic year not found" });
    }

    // Verify student exists and get classroom
    const student = await prisma.student.findUnique({
      where: { id: parseInt(studentId) },
      select: { id: true, classroomId: true }
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Get student's classroom to check class-level subject-wise requirement
    const classroomId = student.classroomId;
    const requiresSubject = await isSubjectWiseRequiredForClass(classroomId);

    if (requiresSubject && !subjectId) {
      return res.status(400).json({
        error: "Subject ID is required for this class (subject-wise attendance enabled)",
      });
    }

    if (!requiresSubject && subjectId) {
      return res.status(400).json({
        error: "Subject ID is not required for this class",
      });
    }

    const attendanceDate = date ? new Date(date) : new Date();

    // Check if attendance already exists
    const existing = await attendanceExists(
      {
        studentId: parseInt(studentId),
        date: attendanceDate,
        academicYearId: resolvedAcademicYearId,
        subjectId: subjectId ? parseInt(subjectId) : null,
      },
      academicYearLabel
    );

    let attendance;
    if (existing) {
      // Update existing attendance
      attendance = await updateAttendance(
        existing.id,
        { status, note: note || null },
        academicYearLabel
      );
    } else {
      // Insert new attendance into year-specific table
      attendance = await insertAttendance(
        {
          studentId: parseInt(studentId),
          staffId: null,
          date: attendanceDate,
          status,
          note: note || null,
          academicYearId: resolvedAcademicYearId,
          subjectId: subjectId ? parseInt(subjectId) : null,
        },
        academicYearLabel
      );
    }

    // Fetch related data for response
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: resolvedAcademicYearId },
      select: { id: true, label: true },
    });

    const student1 = await prisma.student.findUnique({
      where: { id: parseInt(studentId) },
      select: { id: true, name: true, grade: true },
    });

    const subject = subjectId
      ? await prisma.subject.findUnique({
          where: { id: parseInt(subjectId) },
          select: { id: true, name: true },
        })
      : null;

    res.status(201).json({
      ...attendance,
      student1,
      subject,
      academicYear,
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2002" || err.message?.includes("unique")) {
      return res
        .status(409)
        .json({ error: "Attendance already exists for this student, date, and subject" });
    }
    res.status(500).json({ error: "Failed to mark student attendance: " + err.message });
  }
};

export const getStudentAttendance = async (req, res) => {
  try {
    const { studentId, from, to, academicYearId, subjectId } = req.query;
    if (!studentId)
      return res.status(400).json({ error: "studentId is required" });

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      resolvedAcademicYearId = activeYear?.id;
    }

    if (!resolvedAcademicYearId) {
      return res.status(400).json({ error: "Academic year is required" });
    }

    // Get academic year label for table name
    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) {
      return res.status(400).json({ error: "Academic year not found" });
    }

    const where = {
      studentId: parseInt(studentId),
      academicYearId: resolvedAcademicYearId,
      ...(subjectId !== undefined && {
        subjectId: subjectId ? parseInt(subjectId) : null,
      }),
    };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const attendances = await queryAttendance(where, academicYearLabel, {
      orderBy: "date DESC",
    });

    // Enrich with related data
    const enrichedAttendances = await Promise.all(
      attendances.map(async (att) => {
        const [academicYear, subject] = await Promise.all([
          prisma.academicYear.findUnique({
            where: { id: att.academicYearId },
            select: { id: true, label: true },
          }),
          att.subjectId
            ? prisma.subject.findUnique({
                where: { id: att.subjectId },
                select: { id: true, name: true, code: true },
              })
            : null,
        ]);

        return {
          ...att,
          academicYear,
          subject,
        };
      })
    );

    res.json({ attendances: enrichedAttendances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch student attendance" });
  }
};

export const updateStudentAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, date, note, academicYearId, subjectId } = req.body;

    // Get academic year for table name
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) {
        return res.status(400).json({ error: "Academic year is required" });
      }
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) {
      return res.status(400).json({ error: "Academic year not found" });
    }

    const data = {};
    if (status !== undefined) data.status = status;
    if (date) data.date = new Date(date);
    if (note !== undefined) data.note = note;
    if (subjectId !== undefined) {
      data.subjectId = subjectId ? parseInt(subjectId) : null;
    }

    const attendance = await updateAttendance(id, data, academicYearLabel);

    // Enrich with related data
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: attendance.academicYearId },
      select: { id: true, label: true },
    });

    const subject = attendance.subjectId
      ? await prisma.subject.findUnique({
          where: { id: attendance.subjectId },
          select: { id: true, name: true },
        })
      : null;

    res.json({
      ...attendance,
      academicYear,
      subject,
    });
  } catch (err) {
    console.error(err);
    if (err.message?.includes("not found") || err.code === "P2025")
      return res.status(404).json({ error: "Attendance not found" });
    res.status(500).json({ error: "Failed to update attendance" });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicYearId } = req.query;

    // Get academic year for table name
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) {
        return res.status(400).json({ error: "Academic year is required" });
      }
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) {
      return res.status(400).json({ error: "Academic year not found" });
    }

    await deleteAttendanceRecord(id, academicYearLabel);
    res.json({ message: "Attendance deleted" });
  } catch (err) {
    console.error(err);
    if (err.message?.includes("not found"))
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

    // Get academic year label for table name
    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) {
      return res.status(400).json({ error: "Academic year not found" });
    }

    const attendanceDate = date ? new Date(date) : new Date();

    // Check if attendance already exists
    const existing = await attendanceExists(
      {
        staffId: parseInt(staffId),
        date: attendanceDate,
        academicYearId: resolvedAcademicYearId,
      },
      academicYearLabel
    );

    let attendance;
    if (existing) {
      // Update existing attendance
      attendance = await updateAttendance(
        existing.id,
        { status, note: note || null },
        academicYearLabel
      );
    } else {
      // Insert new attendance into year-specific table
      attendance = await insertAttendance(
        {
          studentId: null,
          staffId: parseInt(staffId),
          date: attendanceDate,
          status,
          note: note || null,
          academicYearId: resolvedAcademicYearId,
          subjectId: null,
        },
        academicYearLabel
      );
    }

    // Fetch related data for response
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: resolvedAcademicYearId },
      select: { id: true, label: true },
    });

    const staff = await prisma.staff.findUnique({
      where: { id: parseInt(staffId) },
      select: { id: true, name: true, role: true },
    });

    res.status(201).json({
      ...attendance,
      staff,
      academicYear,
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2002" || err.message?.includes("unique")) {
      return res
        .status(409)
        .json({ error: "Attendance already exists for this staff and date" });
    }
    res.status(500).json({ error: "Failed to mark staff attendance: " + err.message });
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

    if (!resolvedAcademicYearId) {
      return res.status(400).json({ error: "Academic year is required" });
    }

    // Get academic year label for table name
    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) {
      return res.status(400).json({ error: "Academic year not found" });
    }

    const where = {
      staffId: parseInt(staffId),
      academicYearId: resolvedAcademicYearId,
    };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const attendances = await queryAttendance(where, academicYearLabel, {
      orderBy: "date DESC",
    });

    // Enrich with related data
    const enrichedAttendances = await Promise.all(
      attendances.map(async (att) => {
        const academicYear = await prisma.academicYear.findUnique({
          where: { id: att.academicYearId },
          select: { id: true, label: true },
        });

        return {
          ...att,
          academicYear,
        };
      })
    );

    res.json({ attendances: enrichedAttendances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch staff attendance" });
  }
};

export const markBulkStudentAttendance = async (req, res) => {
  try {
    const { date, academicYearId, attendances } = req.body;

    if (!date || !attendances || !Array.isArray(attendances) || attendances.length === 0) {
      return res.status(400).json({
        error: "date and attendances array are required",
      });
    }

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) {
        return res.status(400).json({ error: "No active academic year found" });
      }
      resolvedAcademicYearId = activeYear.id;
    }

    // Get academic year label for table name
    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) {
      return res.status(400).json({ error: "Academic year not found" });
    }

    const attendanceDate = new Date(date);
    if (isNaN(attendanceDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Validate and prepare attendance data
    const validRecords = [];
    const errors = [];
    const studentClassroomMap = new Map(); // Cache classroom checks

    for (let i = 0; i < attendances.length; i++) {
      const att = attendances[i];

      if (!att.studentId || !att.status) {
        errors.push({
          index: i,
          studentId: att.studentId,
          error: "studentId and status are required",
        });
        continue;
      }

      const studentId = parseInt(att.studentId);

      // Get or cache classroom ID for this student
      let classroomId = studentClassroomMap.get(studentId);
      if (classroomId === undefined) {
        classroomId = await getStudentClassroomId(studentId);
        studentClassroomMap.set(studentId, classroomId);
      }

      // Check if subject-wise attendance is required for this class
      const requiresSubject = await isSubjectWiseRequiredForClass(classroomId);

      if (requiresSubject && !att.subjectId) {
        errors.push({
          index: i,
          studentId,
          error: "Subject ID is required for this class (subject-wise attendance enabled)",
        });
        continue;
      }

      if (!requiresSubject && att.subjectId) {
        errors.push({
          index: i,
          studentId,
          error: "Subject ID is not required for this class",
        });
        continue;
      }

      // Check for duplicates in the batch
      const isDuplicate = validRecords.some(
        (r) => r.studentId === studentId && r.subjectId === (att.subjectId || null)
      );

      if (isDuplicate) {
        errors.push({
          index: i,
          studentId,
          error: "Duplicate attendance in batch for this student and subject",
        });
        continue;
      }

      validRecords.push({
        studentId,
        staffId: null,
        date: attendanceDate,
        status: att.status,
        note: att.note || null,
        academicYearId: resolvedAcademicYearId,
        subjectId: att.subjectId ? parseInt(att.subjectId) : null,
      });
    }

    if (validRecords.length === 0) {
      return res.status(400).json({
        error: "No valid attendance records to process",
        errors,
      });
    }

    // Bulk insert into year-specific table
    const results = await bulkInsertAttendance(validRecords, academicYearLabel);

    res.status(201).json({
      message: `Bulk attendance processed`,
      date: attendanceDate,
      academicYearId: resolvedAcademicYearId,
      summary: {
        total: attendances.length,
        valid: validRecords.length,
        inserted: results.inserted,
        updated: results.updated,
        errors: errors.length + results.errors.length,
      },
      errors: errors.length > 0 || results.errors.length > 0 
        ? [...errors, ...results.errors] 
        : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark bulk attendance: " + err.message });
  }
};

/**
 * Get attendance stats for a specific student
 */
export const getStudentAttendanceStats = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) return res.status(400).json({ error: "No active academic year found" });
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) return res.status(400).json({ error: "Academic year not found" });

    const tableName = getAttendanceTableName(academicYearLabel);

    const stats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*)::int as total_days,
        SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END)::int as present_days,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END)::int as late_days,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END)::int as absent_days,
        SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END)::int as excused_days
      FROM "${tableName}"
      WHERE "studentId" = $1
    `, parseInt(studentId));
    
    const result = stats[0] || { total_days: 0, present_days: 0, late_days: 0, absent_days: 0, excused_days: 0 };
    const total = result.total_days || 0;
    const present = result.present_days || 0;
    const late = result.late_days || 0;
    
    const effectivePresent = present + late;
    const percentage = total > 0 ? (effectivePresent / total) * 100 : 0;

    res.json({
      studentId: parseInt(studentId),
      academicYearId: resolvedAcademicYearId,
      totalDays: total,
      presentDays: present,
      lateDays: late,
      absentDays: result.absent_days || 0,
      excusedDays: result.excused_days || 0,
      percentage: parseFloat(percentage.toFixed(2))
    });

  } catch (err) {
    console.error(err);
    // If table doesn't exist (e.g. no attendance marked yet), return 0 stats
    if (err.code === 'P2010' || err.message.includes('does not exist')) {
       return res.json({
         studentId: parseInt(req.params.studentId),
         totalDays: 0,
         percentage: 0
       });
    }
    res.status(500).json({ error: "Failed to fetch student attendance stats" });
  }
};

/**
 * Get attendance stats for a specific staff
 */
export const getStaffAttendanceStats = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { academicYearId } = req.query;

    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) return res.status(400).json({ error: "No active academic year found" });
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) return res.status(400).json({ error: "Academic year not found" });

    const tableName = getAttendanceTableName(academicYearLabel);

    const stats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*)::int as total_days,
        SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END)::int as present_days,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END)::int as late_days,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END)::int as absent_days,
        SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END)::int as excused_days
      FROM "${tableName}"
      WHERE "staffId" = $1
    `, parseInt(staffId));
    
    const result = stats[0] || { total_days: 0, present_days: 0, late_days: 0, absent_days: 0, excused_days: 0 };
    const total = result.total_days || 0;
    const present = result.present_days || 0;
    const late = result.late_days || 0;
    
    const effectivePresent = present + late;
    const percentage = total > 0 ? (effectivePresent / total) * 100 : 0;

    res.json({
      staffId: parseInt(staffId),
      academicYearId: resolvedAcademicYearId,
      totalDays: total,
      presentDays: present,
      lateDays: late,
      absentDays: result.absent_days || 0,
      excusedDays: result.excused_days || 0,
      percentage: parseFloat(percentage.toFixed(2))
    });

  } catch (err) {
    console.error(err);
    if (err.code === 'P2010' || err.message.includes('does not exist')) {
       return res.json({
         staffId: parseInt(req.params.staffId),
         totalDays: 0,
         percentage: 0
       });
    }
    res.status(500).json({ error: "Failed to fetch staff attendance stats" });
  }
};

/**
 * Get overall attendance stats for all students
 */
export const getOverallStudentAttendanceStats = async (req, res) => {
  try {
    const { academicYearId } = req.query;

    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) return res.status(400).json({ error: "No active academic year found" });
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(resolvedAcademicYearId);
    if (!academicYearLabel) return res.status(400).json({ error: "Academic year not found" });

    const tableName = getAttendanceTableName(academicYearLabel);

    // Get total stats
    const stats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*)::int as total_records,
        SUM(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)::int as present_records
      FROM "${tableName}"
      WHERE "studentId" IS NOT NULL
    `);
    
    const result = stats[0] || { total_records: 0, present_records: 0 };
    const total = result.total_records || 0;
    const present = result.present_records || 0;
    
    const percentage = total > 0 ? (present / total) * 100 : 0;

    res.json({
      academicYearId: resolvedAcademicYearId,
      totalRecords: total,
      presentRecords: present,
      overallPercentage: parseFloat(percentage.toFixed(2))
    });

  } catch (err) {
    console.error(err);
    if (err.code === 'P2010' || err.message.includes('does not exist')) {
       return res.json({
         totalRecords: 0,
         overallPercentage: 0
       });
    }
    res.status(500).json({ error: "Failed to fetch overall attendance stats" });
  }
};
