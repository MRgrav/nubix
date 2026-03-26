import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendSuccess, sendError } from "./../utils/responseStructure.js";
import {
  getAcademicYearLabel,
  getAttendanceTableName,
  insertAttendance,
  queryAttendance,
  updateAttendance,
  deleteAttendanceRecord,
  attendanceExists,
  bulkInsertAttendance,
  canTeacherMarkAttendanceFor,
  canUpdateAttendance,
  upsertAttendance,
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
    select: { classroomId: true },
  });
  return student?.classroomId;
};

// Mark attendance for student
export const markStudentAttendance = async (req, res) => {
  try {
    const { studentId, date, status, note, academicYearId, subjectId } =
      req.body;
    if (!studentId || !status) {
      return sendError(res, 400, "studentId and status are required");
    }

    // Resolve academic year
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear)
        return sendError(res, 400, "No active academic year found");
      resolvedAcademicYearId = activeYear.id;
    }

    // Get academic year label for table name
    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel)
      return sendError(res, 400, "Academic year not found");

    // Verify student exists and get classroom
    const student = await prisma.student.findUnique({
      where: { id: parseInt(studentId) },
      select: { id: true, classroomId: true },
    });

    if (!student) return sendError(res, 404, "Student not found");

    // Get student's classroom to check class-level subject-wise requirement
    const requiresSubject = await isSubjectWiseRequiredForClass(
      student.classroomId,
    );
    if (requiresSubject && !subjectId) {
      return sendError(
        res,
        400,
        "Subject ID is required for this class (subject-wise attendance enabled)",
      );
    }
    if (!requiresSubject && subjectId) {
      return sendError(res, 400, "Subject ID is not allowed for this class");
    }

    const attendanceDate = date ? new Date(date) : new Date();

    // ─── NEW: Authorization check ───
    const auth = await canTeacherMarkAttendanceFor(req, {
      studentId: parseInt(studentId),
      subjectId: subjectId ? parseInt(subjectId) : null,
      date: attendanceDate,
      academicYearId: resolvedAcademicYearId,
    });

    if (!auth.allowed) {
      return sendError(
        res,
        403,
        "Unauthorized to mark attendance",
        auth.reason,
      );
    }

    console.log(`Attendance authorized via ${auth.source}`);

    // ⭐ UPSERT INSERT
    const attendance = await upsertAttendance(
      {
        studentId: parseInt(studentId),
        staffId: null,
        date: attendanceDate,
        status,
        note: note || null,
        academicYearId: resolvedAcademicYearId,
        subjectId: subjectId ? parseInt(subjectId) : null,
      },
      academicYearLabel,
      req,
    );

    // Fetch related data for response
    const [academicYear, studentInfo, subject] = await Promise.all([
      prisma.academicYear.findUnique({
        where: { id: resolvedAcademicYearId },
        select: { id: true, label: true },
      }),
      prisma.student.findUnique({
        where: { id: parseInt(studentId) },
        select: { id: true, name: true, grade: true },
      }),
      subjectId
        ? prisma.subject.findUnique({
            where: { id: parseInt(subjectId) },
            select: { id: true, name: true },
          })
        : null,
    ]);

    return sendSuccess(
      res,
      201,
      {
        ...attendance,
        student: studentInfo,
        subject,
        academicYear,
      },
      "Attendance marked successfully",
    );
  } catch (err) {
    console.error(err);
    if (err.code === "P2002" || err.message?.includes("unique")) {
      return sendError(
        res,
        409,
        "Attendance already exists for this student, date, and subject",
      );
    }
    return sendError(
      res,
      500,
      "Failed to mark student attendance",
      err.message,
    );
  }
};

export const markBulkStudentAttendance = async (req, res) => {
  try {
    const { date, academicYearId, attendances } = req.body;

    if (!date || !Array.isArray(attendances) || attendances.length === 0) {
      return sendError(
        res,
        400,
        "date and non-empty attendances array are required",
      );
    }

    let resolvedAcademicYearId = academicYearId;

    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear();
      if (!activeYear) {
        return sendError(res, 400, "No active academic year found");
      }
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );

    if (!academicYearLabel) {
      return sendError(res, 400, "Academic year label not found");
    }

    const attendanceDate = new Date(date);

    if (isNaN(attendanceDate.getTime())) {
      return sendError(res, 400, "Invalid date format");
    }

    // ⭐ Normalize date
    const normalizedDate = attendanceDate.toISOString().split("T")[0];

    // ───────── Authorization ─────────

    for (const att of attendances) {
      if (!att.studentId || !att.status) continue;

      const auth = await canTeacherMarkAttendanceFor(req, {
        studentId: parseInt(att.studentId),
        subjectId: att.subjectId ? parseInt(att.subjectId) : null,
        date: normalizedDate,
        academicYearId: resolvedAcademicYearId,
      });

      if (!auth.allowed) {
        return sendError(
          res,
          403,
          "Unauthorized to mark attendance for one or more students",
          {
            reason: auth.reason,
            studentId: att.studentId,
          },
        );
      }
    }

    // ───────── Validation ─────────

    const validRecords = [];
    const validationErrors = [];

    const studentClassroomMap = new Map();
    const subjectRequirementMap = new Map();
    const seenInBatch = new Set();

    for (let i = 0; i < attendances.length; i++) {
      const att = attendances[i];

      if (!att.studentId || !att.status) {
        validationErrors.push({
          index: i,
          studentId: att.studentId,
          error: "studentId and status are required",
        });
        continue;
      }

      const studentId = parseInt(att.studentId);
      const subjectId = att.subjectId ? parseInt(att.subjectId) : null;

      let classroomId = studentClassroomMap.get(studentId);

      if (classroomId === undefined) {
        classroomId = await getStudentClassroomId(studentId);

        if (!classroomId) {
          validationErrors.push({
            index: i,
            studentId,
            error: "Student has no assigned classroom",
          });
          continue;
        }

        studentClassroomMap.set(studentId, classroomId);
      }

      let requiresSubject = subjectRequirementMap.get(classroomId);

      if (requiresSubject === undefined) {
        requiresSubject = await isSubjectWiseRequiredForClass(classroomId);
        subjectRequirementMap.set(classroomId, requiresSubject);
      }

      if (requiresSubject && !subjectId) {
        validationErrors.push({
          index: i,
          studentId,
          error:
            "Subject ID is required for this class (subject-wise attendance enabled)",
        });
        continue;
      }

      if (!requiresSubject && subjectId) {
        validationErrors.push({
          index: i,
          studentId,
          error: "Subject ID is not allowed for this class",
        });
        continue;
      }

      const uniqueKey = `${studentId}-${subjectId ?? "null"}-${normalizedDate}`;

      if (seenInBatch.has(uniqueKey)) {
        validationErrors.push({
          index: i,
          studentId,
          error:
            "Duplicate entry for this student + subject in the same bulk request",
        });
        continue;
      }

      seenInBatch.add(uniqueKey);

      validRecords.push({
        studentId,
        staffId: null,
        date: attendanceDate, // ⭐ normalized
        status: att.status,
        note: att.note || null,
        academicYearId: resolvedAcademicYearId,
        subjectId,
      });
    }

    if (validRecords.length === 0) {
      return sendError(res, 400, "No valid attendance records to process", {
        validationErrors,
      });
    }

    // ───────── DB UPSERT ─────────

    const results = await bulkInsertAttendance(
      validRecords,
      academicYearLabel,
      req,
    );

    const hasChanges = results.inserted + results.updated > 0;

    return sendSuccess(res, 201, {
      message: hasChanges
        ? "Bulk attendance processed successfully"
        : "No new changes — all records were already marked or skipped",
      date: normalizedDate,
      academicYearId: resolvedAcademicYearId,
      summary: {
        totalReceived: attendances.length,
        validProcessed: validRecords.length,
        inserted: results.inserted,
        updated: results.updated,
        skipped: results.skipped,
        conflicts: results.conflicts?.length || 0,
      },
      conflicts: results.conflicts?.length ? results.conflicts : undefined,
      validationErrors: validationErrors.length ? validationErrors : undefined,
    });
  } catch (err) {
    console.error("Bulk attendance error:", err);

    return sendError(
      res,
      500,
      "Failed to process bulk attendance",
      err.message,
    );
  }
};
/**
 * Admin/Teacher-facing: Get attendance records for any student
 * Supports filters: from/to date, subjectId, pagination
 */
export const getStudentAttendance = async (req, res) => {
  try {
    const {
      studentId: rawStudentId,
      from,
      to,
      academicYearId,
      subjectId,
      page = 1,
      limit = 30,
    } = req.query;

    if (!rawStudentId) {
      return sendError(res, 400, "studentId is required");
    }

    // Parse studentId early and validate
    const studentId = parseInt(rawStudentId, 10);
    if (isNaN(studentId) || studentId <= 0) {
      return sendError(res, 400, "studentId must be a valid positive integer");
    }

    let resolvedAcademicYearId = Number(academicYearId);
    if (isNaN(resolvedAcademicYearId)) {
      const active = await getActiveAcademicYear();
      if (!active) return sendError(res, 400, "No active academic year found");
      resolvedAcademicYearId = active.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel) {
      return sendError(res, 400, "Academic year not found");
    }

    const where = {
      studentId,
      academicYearId: resolvedAcademicYearId,
    };

    if (subjectId) where.subjectId = parseInt(subjectId);

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from + "T00:00:00.000Z");
      if (to) where.date.lte = new Date(to + "T23:59:59.999Z");
    }

    // Pagination
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Count total matching records
    const totalQuery = `
      SELECT COUNT(*)::int as count 
      FROM "${getAttendanceTableName(academicYearLabel)}" 
      WHERE "studentId" = $1 
        AND "academicYearId" = $2
        ${subjectId ? ` AND "subjectId" = $3` : ""}
        ${from ? ` AND date >= $${subjectId ? 4 : 3}` : ""}
        ${to ? ` AND date <= $${from ? (subjectId ? 5 : 4) : subjectId ? 4 : 3}` : ""}
    `;

    const totalParams = [studentId, resolvedAcademicYearId];
    if (subjectId) totalParams.push(parseInt(subjectId));
    if (from) totalParams.push(new Date(from + "T00:00:00.000Z"));
    if (to) totalParams.push(new Date(to + "T23:59:59.999Z"));

    const totalResult = await prisma.$queryRawUnsafe(
      totalQuery,
      ...totalParams,
    );
    const total = totalResult[0]?.count || 0;

    // Fetch paginated records
    const attendances = await queryAttendance(where, academicYearLabel, {
      orderBy: "date DESC",
      skip,
      limit: limitNum,
    });

    // Enrich with related data
    const enriched = await Promise.all(
      attendances.map(async (att) => {
        const [academicYear, subject, studentInfo] = await Promise.all([
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
          prisma.student.findUnique({
            where: { id: studentId }, // <-- studentId is already parsed as number
            select: {
              name: true,
              classroom: { select: { name: true, section: true } },
            },
          }),
        ]);

        return {
          ...att,
          date: att.date.toISOString().split("T")[0], // cleaner format
          academicYear,
          subject,
          studentName: studentInfo?.name,
          classroom: studentInfo?.classroom,
        };
      }),
    );

    return sendSuccess(
      res,
      200,
      enriched,
      "Student attendance records fetched",
      {
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: skip + limitNum < total,
          hasPrev: pageNum > 1,
        },
      },
    );
  } catch (err) {
    console.error("Get student attendance error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch student attendance",
      err.message,
    );
  }
};

/**
 * Admin/Staff-facing: Get attendance records for a classroom (with filters)
 * Useful for class teachers, subject teachers, or admin to view entire class/stream/subject attendance
 */
export const getClassroomAttendance = async (req, res) => {
  try {
    // Optional: restrict to ADMIN or STAFF
    if (!req.user || !["ADMIN", "STAFF"].includes(req.user.role)) {
      return sendError(
        res,
        403,
        "Only admin or staff can view classroom attendance",
      );
    }

    const {
      classroomId: rawClassroomId,
      streamId: rawStreamId,
      subjectId: rawSubjectId,
      from,
      to,
      status,
      academicYearId,
      page = 1,
      limit = 30,
    } = req.query;

    if (!rawClassroomId) {
      return sendError(res, 400, "classroomId is required");
    }

    const classroomId = parseInt(rawClassroomId, 10);
    if (isNaN(classroomId) || classroomId <= 0) {
      return sendError(
        res,
        400,
        "classroomId must be a valid positive integer",
      );
    }

    let streamId = rawStreamId ? parseInt(rawStreamId, 10) : null;
    if (rawStreamId && (isNaN(streamId) || streamId <= 0)) {
      return sendError(
        res,
        400,
        "streamId must be a valid positive integer or null",
      );
    }

    let subjectId = rawSubjectId ? parseInt(rawSubjectId, 10) : null;
    if (rawSubjectId && (isNaN(subjectId) || subjectId <= 0)) {
      return sendError(
        res,
        400,
        "subjectId must be a valid positive integer or null",
      );
    }

    // Resolve academic year
    let resolvedAcademicYearId = Number(academicYearId);
    if (isNaN(resolvedAcademicYearId)) {
      const active = await getActiveAcademicYear();
      if (!active) return sendError(res, 400, "No active academic year found");
      resolvedAcademicYearId = active.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel) {
      return sendError(res, 400, "Academic year not found");
    }

    const tableName = getAttendanceTableName(academicYearLabel);

    // ─── Build WHERE conditions ───
    let whereClauses = [
      `"academicYearId" = $1`,
      `"studentId" IN (SELECT id FROM "Student" WHERE "classroomId" = $2)`,
    ];
    const params = [resolvedAcademicYearId, classroomId];
    let paramIdx = 3;

    if (streamId !== null) {
      whereClauses.push(
        `"studentId" IN (SELECT "studentId" FROM "StudentStream" WHERE "streamId" = $${paramIdx++} AND "academicYearId" = $1)`,
      );
      params.push(streamId);
    }

    if (subjectId !== null) {
      whereClauses.push(`"subjectId" = $${paramIdx++}`);
      params.push(subjectId);
    }

    if (status) {
      whereClauses.push(`status = $${paramIdx++}`);
      params.push(status.toUpperCase());
    }

    if (from) {
      whereClauses.push(`date >= $${paramIdx++}`);
      params.push(new Date(from + "T00:00:00.000Z"));
    }

    if (to) {
      whereClauses.push(`date <= $${paramIdx++}`);
      params.push(new Date(to + "T23:59:59.999Z"));
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // ─── 1. Count total matching records ───
    const countQuery = `
      SELECT COUNT(*)::int as total
      FROM "${tableName}"
      ${whereSql}
    `;

    const countResult = await prisma.$queryRawUnsafe(countQuery, ...params);
    const total = countResult[0]?.total || 0;

    // ─── 2. Pagination ───
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Add pagination to main query
    const mainQuery = `
      SELECT *
      FROM "${tableName}"
      ${whereSql}
      ORDER BY date DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    params.push(limitNum, skip);

    const attendances = await prisma.$queryRawUnsafe(mainQuery, ...params);

    // ─── 3. Enrich records ───
    const enriched = await Promise.all(
      attendances.map(async (att) => {
        const [academicYear, subject, student] = await Promise.all([
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
          prisma.student.findUnique({
            where: { id: att.studentId },
            select: {
              name: true,
              classroom: { select: { name: true, section: true } },
            },
          }),
        ]);

        return {
          ...att,
          date: att.date.toISOString().split("T")[0],
          academicYear,
          subject,
          studentName: student?.name,
          classroom: student?.classroom,
        };
      }),
    );

    // ─── 4. Classroom & stream info (for response header) ───
    const classroomInfo = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { name: true, section: true, isSubjectWiseAttendance: true },
    });

    let streamInfo = null;
    if (streamId !== null) {
      streamInfo = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { id: true, name: true },
      });
    }

    return sendSuccess(
      res,
      200,
      enriched,
      "Classroom attendance fetched successfully",
      {
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: skip + limitNum < total,
          hasPrev: pageNum > 1,
        },
        classroom: classroomInfo,
        stream: streamInfo,
      },
    );
  } catch (err) {
    console.error("Get classroom attendance error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch classroom attendance",
      err.message,
    );
  }
};

/**
 * Admin/Staff-facing: Get summarized attendance stats per student in a classroom
 * Returns one row per student with attendance summary
 */
export const getClassroomAttendanceSummary = async (req, res) => {
  try {
    if (!req.user || !["ADMIN", "STAFF"].includes(req.user.role)) {
      return sendError(
        res,
        403,
        "Only admin or staff can view classroom attendance summary",
      );
    }

    const {
      classroomId: rawClassroomId,
      streamId: rawStreamId,
      subjectId: rawSubjectId,
      from,
      to,
      academicYearId,
    } = req.query;

    if (!rawClassroomId) {
      return sendError(res, 400, "classroomId is required");
    }

    const classroomId = parseInt(rawClassroomId, 10);
    if (isNaN(classroomId) || classroomId <= 0) {
      return sendError(
        res,
        400,
        "classroomId must be a valid positive integer",
      );
    }

    const streamId = rawStreamId ? parseInt(rawStreamId, 10) : null;
    if (rawStreamId && (isNaN(streamId) || streamId <= 0)) {
      return sendError(
        res,
        400,
        "streamId must be a valid positive integer or null",
      );
    }

    const subjectId = rawSubjectId ? parseInt(rawSubjectId, 10) : null;
    if (rawSubjectId && (isNaN(subjectId) || subjectId <= 0)) {
      return sendError(
        res,
        400,
        "subjectId must be a valid positive integer or null",
      );
    }

    let resolvedAcademicYearId = Number(academicYearId);
    if (isNaN(resolvedAcademicYearId)) {
      const active = await getActiveAcademicYear();
      if (!active) return sendError(res, 400, "No active academic year found");
      resolvedAcademicYearId = active.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel)
      return sendError(res, 400, "Academic year not found");

    const attendanceTable = getAttendanceTableName(academicYearLabel);

    // ─── Get all students in the classroom/stream ───
    // Removed s.rollNumber since it doesn't exist
    const studentsQuery = `
      SELECT 
        s.id AS "studentId",
        s.name AS "studentName",
        s.grade,
        c.name AS "className",
        c.section AS "classSection"
      FROM "Student" s
      JOIN "Classroom" c ON s."classroomId" = c.id
      WHERE s."classroomId" = $1
        ${
          streamId !== null
            ? `AND s.id IN (
            SELECT "studentId" FROM "StudentStream" 
            WHERE "streamId" = $2 AND "academicYearId" = $3
          )`
            : ""
        }
      ORDER BY s.name
    `;

    const studentParams = [classroomId];
    if (streamId !== null) {
      studentParams.push(streamId, resolvedAcademicYearId);
    }

    const students = await prisma.$queryRawUnsafe(
      studentsQuery,
      ...studentParams,
    );

    if (students.length === 0) {
      return sendSuccess(
        res,
        200,
        [],
        "No students found in this classroom/stream",
        {
          classroomId,
          streamId: streamId || null,
          academicYearId: resolvedAcademicYearId,
        },
      );
    }

    // ─── Get attendance stats per student ───
    const studentIds = students.map((s) => s.studentId);

    let attWhere = [`"studentId" = ANY($1)`, `"academicYearId" = $2`];
    const attParams = [studentIds, resolvedAcademicYearId];
    let attIdx = 3;

    if (from) {
      attWhere.push(`date >= $${attIdx++}`);
      attParams.push(new Date(from + "T00:00:00.000Z"));
    }
    if (to) {
      attWhere.push(`date <= $${attIdx++}`);
      attParams.push(new Date(to + "T23:59:59.999Z"));
    }
    if (subjectId !== null) {
      attWhere.push(`"subjectId" = $${attIdx++}`);
      attParams.push(subjectId);
    }

    const statsQuery = `
      SELECT 
        "studentId",
        COUNT(*)::int AS "totalMarked",
        SUM(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)::int AS "present",
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END)::int AS "late",
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END)::int AS "absent",
        SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END)::int AS "excused"
      FROM "${attendanceTable}"
      WHERE ${attWhere.join(" AND ")}
      GROUP BY "studentId"
    `;

    const stats = await prisma.$queryRawUnsafe(statsQuery, ...attParams);

    const statsMap = new Map(stats.map((s) => [s.studentId, s]));

    // ─── Expected classes (stream-aware) ───
    const expectedParams = [resolvedAcademicYearId, classroomId];
    let streamFilter = "";
    if (streamId !== null) {
      streamFilter = ` AND ("streamId" IS NULL OR "streamId" = $${expectedParams.length + 1})`;
      expectedParams.push(streamId);
    }

    const expectedResult = await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(*)::int as expected_classes
      FROM "TimetableSlot"
      WHERE "academicYearId" = $1
        AND "classroomId" = $2
        AND "slotType" = 'CLASS'
        ${streamFilter}
    `,
      ...expectedParams,
    );

    const expectedClasses = expectedResult[0]?.expected_classes || 0;

    // ─── Build per-student summary ───
    const studentSummaries = students.map((student) => {
      const st = statsMap.get(student.studentId) || {
        totalMarked: 0,
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
      };

      const totalMarked = st.totalMarked;
      const effectivePresent = st.present + st.late;
      const presentPercentage =
        totalMarked > 0 ? (effectivePresent / totalMarked) * 100 : 0;

      return {
        studentId: student.studentId,
        studentName: student.studentName,
        grade: student.grade || null,
        totalMarkedDays: totalMarked,
        presentDays: st.present,
        lateDays: st.late,
        absentDays: st.absent,
        excusedDays: st.excused,
        presentPercentage: parseFloat(presentPercentage.toFixed(2)),
        expectedClasses,
        attendanceCoverage:
          expectedClasses > 0
            ? parseFloat(((totalMarked / expectedClasses) * 100).toFixed(2))
            : 0,
      };
    });

    // ─── Classroom & stream info ───
    const classroomInfo = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        name: true,
        section: true,
        isSubjectWiseAttendance: true,
      },
    });

    let streamInfo = null;
    if (streamId !== null) {
      streamInfo = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { id: true, name: true },
      });
    }

    return sendSuccess(
      res,
      200,
      studentSummaries,
      "Classroom attendance summary fetched",
      {
        classroom: classroomInfo,
        stream: streamInfo,
        academicYearId: resolvedAcademicYearId,
        period: from && to ? `${from} to ${to}` : "Full academic year",
        totalStudents: students.length,
        totalExpectedClasses: expectedClasses,
        filtersApplied: {
          classroomId,
          streamId: streamId || null,
          subjectId: subjectId || null,
          from: from || null,
          to: to || null,
        },
      },
    );
  } catch (err) {
    console.error("Get classroom attendance summary error:", err);
    return sendError(
      res,
      500,
      "Failed to fetch classroom attendance summary",
      err.message,
    );
  }
};
/**
 * Get current student's own attendance records
 * Student-facing API - only returns data for the logged-in student
 * Supports filters: from/to date, subjectId, status, pagination
 */
export const getStudentOwnAttendance = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "STUDENT") {
      return sendError(
        res,
        403,
        "Only students can access their own attendance",
      );
    }

    const userId = req.user.userId;
    if (!userId) return sendError(res, 401, "Invalid authentication");

    // Find student linked to this user
    const student = await prisma.student.findFirst({
      where: { userId },
      select: {
        id: true,
        name: true,
        classroom: { select: { name: true, section: true } },
      },
    });

    if (!student)
      return sendError(res, 403, "No student profile linked to this account");

    const studentId = student.id;

    const {
      from,
      to,
      subjectId,
      status,
      page = 1,
      limit = 60,
      academicYearId,
    } = req.query;

    let resolvedAcademicYearId = Number(academicYearId);
    if (!resolvedAcademicYearId) {
      const active = await getActiveAcademicYear();
      if (!active) return sendError(res, 400, "No active academic year found");
      resolvedAcademicYearId = active.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel)
      return sendError(res, 400, "Academic year not found");

    const where = {
      studentId,
      academicYearId: resolvedAcademicYearId,
    };

    if (subjectId) where.subjectId = parseInt(subjectId);
    if (status) where.status = status.toUpperCase();
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from + "T00:00:00.000Z");
      if (to) where.date.lte = new Date(to + "T23:59:59.999Z");
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Count total
    const total = await prisma
      .$queryRawUnsafe(
        `SELECT COUNT(*)::int as count 
       FROM "${getAttendanceTableName(academicYearLabel)}" 
       WHERE "studentId" = $1 AND "academicYearId" = $2`,
        studentId,
        resolvedAcademicYearId,
      )
      .then((r) => r[0]?.count || 0);

    const attendances = await queryAttendance(where, academicYearLabel, {
      orderBy: "date DESC",
      skip,
      limit: limitNum,
    });

    const enriched = attendances.map((att) => ({
      id: att.id,
      date: att.date.toISOString().split("T")[0], // cleaner YYYY-MM-DD
      status: att.status,
      note: att.note,
      subjectId: att.subjectId,
      // only include subject name if needed
    }));

    return sendSuccess(
      res,
      200,
      {
        student: {
          id: studentId,
          name: student.name,
          classroom: student.classroom,
        },
        academicYearId: resolvedAcademicYearId,
        records: enriched,
      },
      "Your attendance records fetched",
      {
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: skip + limitNum < total,
          hasPrev: pageNum > 1,
        },
      },
    );
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch attendance", err.message);
  }
};

/**
 * Student-facing: Get summary stats of my attendance
 * Shows total classes, present, absent, percentage, etc.
 */
export const getStudentOwnAttendanceStats = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "STUDENT") {
      return sendError(res, 403, "Only students can access their stats");
    }

    const userId = req.user.userId;

    // Find student linked to this user
    const student = await prisma.student.findFirst({
      where: { userId },
      select: {
        id: true,
        classroomId: true, // keep this
        // removed streamId — it doesn't exist
      },
    });

    if (!student) {
      return sendError(res, 403, "No student profile found");
    }

    const studentId = student.id;
    const classroomId = student.classroomId;

    const { academicYearId, from, to } = req.query;

    let resolvedAcademicYearId = Number(academicYearId);
    if (!resolvedAcademicYearId) {
      const active = await getActiveAcademicYear();
      if (!active) return sendError(res, 400, "No active academic year found");
      resolvedAcademicYearId = active.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel)
      return sendError(res, 400, "Academic year not found");

    const attendanceTable = getAttendanceTableName(academicYearLabel);

    // ─── Build date filter for attendance ───
    let dateFilter = "";
    const params = [studentId, resolvedAcademicYearId];
    let paramIdx = 3;

    if (from) {
      dateFilter += ` AND date >= $${paramIdx++}`;
      params.push(new Date(from + "T00:00:00.000Z"));
    }
    if (to) {
      dateFilter += ` AND date <= $${paramIdx++}`;
      params.push(new Date(to + "T23:59:59.999Z"));
    }

    // ─── 1. Attendance-based stats ───
    const attendanceStats = await prisma.$queryRawUnsafe(
      `
      SELECT
        COUNT(*)::int as total_marked_days,
        SUM(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)::int as present_days,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END)::int as late_days,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END)::int as absent_days,
        SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END)::int as excused_days
      FROM "${attendanceTable}"
      WHERE "studentId" = $1
        AND "academicYearId" = $2
        ${dateFilter}
    `,
      ...params,
    );

    const attResult = attendanceStats[0] || {
      total_marked_days: 0,
      present_days: 0,
      late_days: 0,
      absent_days: 0,
      excused_days: 0,
    };

    // ─── 2. Timetable-based expected classes (using classroomId only) ───
    const expectedClassesResult = await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(*)::int as expected_classes
      FROM "TimetableSlot"
      WHERE "academicYearId" = $1
        AND "classroomId" = $2
        AND "slotType" = 'CLASS'
    `,
      resolvedAcademicYearId,
      classroomId,
    );

    const expectedClasses = expectedClassesResult[0]?.expected_classes || 0;

    // ─── 3. Combine & calculate percentages ───
    const totalMarked = attResult.total_marked_days;
    const effectivePresent = attResult.present_days + attResult.late_days;

    const presentPercentage =
      totalMarked > 0 ? (effectivePresent / totalMarked) * 100 : 0;
    const attendanceCoverage =
      expectedClasses > 0 ? (totalMarked / expectedClasses) * 100 : 0;

    return sendSuccess(
      res,
      200,
      {
        academicYearId: resolvedAcademicYearId,
        period: from && to ? `${from} to ${to}` : "Full academic year",
        // Attendance-based (actual recorded)
        totalMarkedDays: totalMarked,
        presentDays: attResult.present_days,
        lateDays: attResult.late_days,
        absentDays: attResult.absent_days,
        excusedDays: attResult.excused_days,
        presentPercentage: parseFloat(presentPercentage.toFixed(2)),
        // Timetable-based (expected)
        totalExpectedClasses: expectedClasses,
        attendanceCoveragePercentage: parseFloat(attendanceCoverage.toFixed(2)),
        unmarkedClasses: expectedClasses - totalMarked,
      },
      "Your attendance summary fetched successfully",
    );
  } catch (err) {
    console.error("Attendance stats error:", err);
    return sendError(res, 500, "Failed to fetch attendance stats", err.message);
  }
};

/**
 * Admin-facing: Update an existing attendance record
 * Only ADMIN role allowed
 */
export const updateStudentAttendance = async (req, res) => {
  try {
    if (!canUpdateAttendance(req)) {
      return sendError(res, 403, "Only ADMIN can update attendance records");
    }

    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return sendError(
        res,
        400,
        "Invalid attendance ID — must be a positive integer",
      );
    }

    const { status, date, note, academicYearId, subjectId } = req.body;

    let resolvedAcademicYearId = Number(academicYearId);
    if (isNaN(resolvedAcademicYearId)) {
      const active = await getActiveAcademicYear();
      if (!active) return sendError(res, 400, "No active academic year found");
      resolvedAcademicYearId = active.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel)
      return sendError(res, 400, "Academic year not found");

    const updateData = {};
    if (status !== undefined) updateData.status = status.toUpperCase();
    if (date) updateData.date = new Date(date);
    if (note !== undefined) updateData.note = note;
    if (subjectId !== undefined) {
      updateData.subjectId = subjectId ? parseInt(subjectId) : null;
    }

    if (Object.keys(updateData).length === 0) {
      return sendError(res, 400, "No fields provided to update");
    }

    // Pass the parsed NUMBER to helper
    const updated = await updateAttendance(id, updateData, academicYearLabel);

    if (!updated) {
      return sendError(res, 404, "Attendance record not found");
    }

    // Enrich response
    const [academicYear, subject] = await Promise.all([
      prisma.academicYear.findUnique({
        where: { id: updated.academicYearId },
        select: { id: true, label: true },
      }),
      updated.subjectId
        ? prisma.subject.findUnique({
            where: { id: updated.subjectId },
            select: { id: true, name: true },
          })
        : null,
    ]);

    return sendSuccess(
      res,
      200,
      {
        ...updated,
        date: updated.date?.toISOString().split("T")[0] || null,
        academicYear,
        subject,
      },
      "Attendance record updated successfully",
    );
  } catch (err) {
    console.error("Update attendance error:", err);

    if (err.code === "P2025" || err.message?.includes("not found")) {
      return sendError(res, 404, "Attendance record not found");
    }

    if (err.meta?.message?.includes("operator does not exist")) {
      return sendError(
        res,
        500,
        "Database type mismatch during update",
        err.meta.message,
      );
    }

    return sendError(res, 500, "Failed to update attendance", err.message);
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

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
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
    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
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
      academicYearLabel,
    );

    let attendance;
    if (existing) {
      // Update existing attendance
      attendance = await updateAttendance(
        existing.id,
        { status, note: note || null },
        academicYearLabel,
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
        academicYearLabel,
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
    res
      .status(500)
      .json({ error: "Failed to mark staff attendance: " + err.message });
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
    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
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
      }),
    );

    res.json({ attendances: enrichedAttendances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch staff attendance" });
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
      if (!activeYear)
        return res.status(400).json({ error: "No active academic year found" });
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel)
      return res.status(400).json({ error: "Academic year not found" });

    const tableName = getAttendanceTableName(academicYearLabel);

    const stats = await prisma.$queryRawUnsafe(
      `
      SELECT 
        COUNT(*)::int as total_days,
        SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END)::int as present_days,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END)::int as late_days,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END)::int as absent_days,
        SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END)::int as excused_days
      FROM "${tableName}"
      WHERE "studentId" = $1
    `,
      parseInt(studentId),
    );

    const result = stats[0] || {
      total_days: 0,
      present_days: 0,
      late_days: 0,
      absent_days: 0,
      excused_days: 0,
    };
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
      percentage: parseFloat(percentage.toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    // If table doesn't exist (e.g. no attendance marked yet), return 0 stats
    if (err.code === "P2010" || err.message.includes("does not exist")) {
      return res.json({
        studentId: parseInt(req.params.studentId),
        totalDays: 0,
        percentage: 0,
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
      if (!activeYear)
        return res.status(400).json({ error: "No active academic year found" });
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel)
      return res.status(400).json({ error: "Academic year not found" });

    const tableName = getAttendanceTableName(academicYearLabel);

    const stats = await prisma.$queryRawUnsafe(
      `
      SELECT 
        COUNT(*)::int as total_days,
        SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END)::int as present_days,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END)::int as late_days,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END)::int as absent_days,
        SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END)::int as excused_days
      FROM "${tableName}"
      WHERE "staffId" = $1
    `,
      parseInt(staffId),
    );

    const result = stats[0] || {
      total_days: 0,
      present_days: 0,
      late_days: 0,
      absent_days: 0,
      excused_days: 0,
    };
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
      percentage: parseFloat(percentage.toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2010" || err.message.includes("does not exist")) {
      return res.json({
        staffId: parseInt(req.params.staffId),
        totalDays: 0,
        percentage: 0,
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
      if (!activeYear)
        return res.status(400).json({ error: "No active academic year found" });
      resolvedAcademicYearId = activeYear.id;
    }

    const academicYearLabel = await getAcademicYearLabel(
      resolvedAcademicYearId,
    );
    if (!academicYearLabel)
      return res.status(400).json({ error: "Academic year not found" });

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
      overallPercentage: parseFloat(percentage.toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2010" || err.message.includes("does not exist")) {
      return res.json({
        totalRecords: 0,
        overallPercentage: 0,
      });
    }
    res.status(500).json({ error: "Failed to fetch overall attendance stats" });
  }
};
