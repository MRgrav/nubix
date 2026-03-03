import prisma from "../models/prisma.js";
import { getActiveAcademicYear } from "./academicYearHelper.js";
/**
 * Get table name for attendance based on academic year
 * Format: Attendance_2025_2026
 */
export const getAttendanceTableName = (academicYearLabel) => {
  // Convert "2025-2026" to "Attendance_2025_2026"
  const sanitized = academicYearLabel
    .replace(/[^0-9-]/g, "")
    .replace(/-/g, "_");
  return `Attendance_${sanitized}`;
};

/**
 * Get or create attendance table for an academic year
 * Creates the table if it doesn't exist
 */
export const ensureAttendanceTable = async (academicYearLabel) => {
  const tableName = getAttendanceTableName(academicYearLabel);
  const quotedTableName = `"${tableName}"`;

  // Check if table exists
  const tableExistsResult = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    tableName,
  );

  if (!tableExistsResult[0].exists) {
    // Create table with same structure as Attendance model
    await prisma.$executeRawUnsafe(`
      CREATE TABLE ${quotedTableName} (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
        note TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "studentId" INTEGER REFERENCES "Student"(id) ON DELETE CASCADE,
        "staffId" INTEGER REFERENCES "Staff"(id) ON DELETE CASCADE,
        "academicYearId" INTEGER NOT NULL REFERENCES "AcademicYear"(id) ON DELETE CASCADE,
        "subjectId" INTEGER REFERENCES "Subject"(id) ON DELETE SET NULL,
        CONSTRAINT "${tableName}_student_unique" UNIQUE ("studentId", date, "academicYearId", "subjectId"),
        CONSTRAINT "${tableName}_staff_unique" UNIQUE ("staffId", date, "academicYearId")
      )
    `);

    await prisma.$executeRawUnsafe(
      `CREATE INDEX "${tableName}_student_idx" ON ${quotedTableName}("studentId")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "${tableName}_staff_idx" ON ${quotedTableName}("staffId")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "${tableName}_date_idx" ON ${quotedTableName}(date)`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "${tableName}_academic_year_idx" ON ${quotedTableName}("academicYearId")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "${tableName}_subject_idx" ON ${quotedTableName}("subjectId")`,
    );
  }

  return `"${tableName}"`;
};

/**
 * Get academic year label from ID
 */
export const getAcademicYearLabel = async (academicYearId) => {
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { label: true },
  });
  return academicYear?.label;
};

/**
 * Insert attendance into year-specific table
 */
export const insertAttendance = async (data, academicYearLabel) => {
  const tableName = await ensureAttendanceTable(academicYearLabel);

  const { studentId, staffId, date, status, note, academicYearId, subjectId } =
    data;

  const result = await prisma.$queryRawUnsafe(
    `INSERT INTO ${tableName} 
    (date, status, note, "studentId", "staffId", "academicYearId", "subjectId", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    RETURNING *`,
    date,
    status,
    note || null,
    studentId || null,
    staffId || null,
    academicYearId,
    subjectId || null,
  );

  return result[0];
};

/**
 * Query attendance from year-specific table
 */
export const queryAttendance = async (
  where,
  academicYearLabel,
  options = {},
) => {
  const tableName = await ensureAttendanceTable(academicYearLabel);

  let query = `SELECT * FROM ${tableName} WHERE 1=1`;
  const params = [];
  let paramIndex = 1;

  if (where.studentId) {
    query += ` AND "studentId" = $${paramIndex++}`;
    params.push(where.studentId);
  }

  if (where.staffId) {
    query += ` AND "staffId" = $${paramIndex++}`;
    params.push(where.staffId);
  }

  if (where.academicYearId) {
    query += ` AND "academicYearId" = $${paramIndex++}`;
    params.push(where.academicYearId);
  }

  if (where.subjectId !== undefined) {
    if (where.subjectId === null) {
      query += ` AND "subjectId" IS NULL`;
    } else {
      query += ` AND "subjectId" = $${paramIndex++}`;
      params.push(where.subjectId);
    }
  }

  if (where.date) {
    if (where.date.gte) {
      query += ` AND date >= $${paramIndex++}`;
      params.push(where.date.gte);
    }
    if (where.date.lte) {
      query += ` AND date <= $${paramIndex++}`;
      params.push(where.date.lte);
    }
  }

  if (options.orderBy) {
    query += ` ORDER BY ${options.orderBy}`;
  }

  if (options.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(options.limit);
  }

  if (options.skip) {
    query += ` OFFSET $${paramIndex++}`;
    params.push(options.skip);
  }

  const result = await prisma.$queryRawUnsafe(query, ...params);
  return result;
};

/**
 * Update attendance record in the year-specific table
 * @param {number} id - Attendance record ID (must be integer)
 * @param {object} data - Fields to update
 * @param {string} academicYearLabel - e.g. "2025_2026"
 */
export const updateAttendance = async (id, data, academicYearLabel) => {
  const tableName = await ensureAttendanceTable(academicYearLabel);

  // Safety check: id must be a number
  if (typeof id !== "number" || isNaN(id) || id <= 0) {
    throw new Error("Invalid attendance ID — must be a positive integer");
  }

  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(data.status);
  }

  if (data.date !== undefined) {
    updates.push(`date = $${paramIndex++}`);
    params.push(data.date instanceof Date ? data.date : new Date(data.date));
  }

  if (data.note !== undefined) {
    updates.push(`note = $${paramIndex++}`);
    params.push(data.note);
  }

  if (data.subjectId !== undefined) {
    updates.push(`"subjectId" = $${paramIndex++}`);
    params.push(data.subjectId); // already number or null
  }

  if (updates.length === 0) {
    throw new Error("No fields to update");
  }

  // Push id as last parameter (number)
  params.push(id);

  const query = `
    UPDATE ${tableName}
    SET ${updates.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await prisma.$queryRawUnsafe(query, ...params);

  return result.length > 0 ? result[0] : null;
};

/**
 * Delete attendance from year-specific table
 */
export const deleteAttendanceRecord = async (id, academicYearLabel) => {
  const tableName = await ensureAttendanceTable(academicYearLabel);

  await prisma.$executeRawUnsafe(`DELETE FROM ${tableName} WHERE id = $1`, id);
};

/**
 * Check if attendance exists in year-specific table
 */
export const attendanceExists = async (where, academicYearLabel) => {
  const tableName = await ensureAttendanceTable(academicYearLabel);

  let query = `SELECT id FROM ${tableName} WHERE 1=1`;
  const params = [];
  let paramIndex = 1;

  if (where.studentId) {
    query += ` AND "studentId" = $${paramIndex++}`;
    params.push(where.studentId);
  }

  if (where.staffId) {
    query += ` AND "staffId" = $${paramIndex++}`;
    params.push(where.staffId);
  }

  if (where.date) {
    query += ` AND date = $${paramIndex++}`;
    params.push(where.date);
  }

  if (where.academicYearId) {
    query += ` AND "academicYearId" = $${paramIndex++}`;
    params.push(where.academicYearId);
  }

  if (where.subjectId !== undefined) {
    if (where.subjectId === null) {
      query += ` AND "subjectId" IS NULL`;
    } else {
      query += ` AND "subjectId" = $${paramIndex++}`;
      params.push(where.subjectId);
    }
  }

  query += ` LIMIT 1`;

  const result = await prisma.$queryRawUnsafe(query, ...params);
  return result.length > 0 ? result[0] : null;
};

/**
 * Bulk upsert attendance records — guaranteed no duplicates
 * Uses transaction + upsert + existence check fallback
 */
export const bulkInsertAttendance = async (records, academicYearLabel) => {
  if (!records || records.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0, errors: [] };
  }

  const tableName = await ensureAttendanceTable(academicYearLabel);
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Use Prisma transaction for atomicity
  await prisma.$transaction(async (tx) => {
    const batchSize = 50; // smaller batch to avoid param limit

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      for (const record of batch) {
        try {
          // 1. Check if already exists (safe & fast)
          const existing = await tx.$queryRawUnsafe(
            `SELECT id FROM ${tableName} 
             WHERE "studentId" = $1 
               AND date = $2 
               AND "academicYearId" = $3 
               AND ("subjectId" = $4 OR ("subjectId" IS NULL AND $4 IS NULL))
             LIMIT 1`,
            record.studentId,
            record.date,
            record.academicYearId,
            record.subjectId,
          );

          if (existing.length > 0) {
            // 2. Update existing record
            await tx.$executeRawUnsafe(
              `UPDATE ${tableName} 
               SET status = $1, note = $2, "updatedAt" = CURRENT_TIMESTAMP
               WHERE id = $3`,
              record.status,
              record.note || null,
              existing[0].id,
            );
            results.updated++;
          } else {
            // 3. Insert new
            await tx.$executeRawUnsafe(
              `INSERT INTO ${tableName} 
                (date, status, note, "studentId", "staffId", "academicYearId", "subjectId", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              record.date,
              record.status,
              record.note || null,
              record.studentId,
              record.staffId || null,
              record.academicYearId,
              record.subjectId,
            );
            results.inserted++;
          }
        } catch (err) {
          results.errors.push({
            record: { ...record, index: i + batch.indexOf(record) },
            error: err.message,
          });
        }
      }
    }
  });

  return results;
};

export const getStaffIdFromUser = async (userId) => {
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      staff: {
        select: { id: true },
      },
    },
  });

  if (!user || user.role !== "STAFF") return null;
  return user.staff?.id || null;
};

/**
 * Check if the requesting teacher (req.user) is allowed to mark attendance
 * for this student / subject / classroom on the given date
 */
export const canTeacherMarkAttendanceFor = async (req, target) => {
  const { studentId, subjectId, date, academicYearId } = target;

  if (!req.user) {
    return { allowed: false, reason: "Not authenticated" };
  }

  const role = req.user.role;

  if (!["ADMIN", "STAFF"].includes(role)) {
    return {
      allowed: false,
      reason: "Only ADMIN or STAFF can mark attendance",
    };
  }

  if (role === "ADMIN") {
    return { allowed: true, reason: "ADMIN has full permission" };
  }

  // ─── STAFF only from here ───
  const teacherId = await getStaffIdFromUser(req.user.userId);
  if (!teacherId) {
    return {
      allowed: false,
      reason: "STAFF role but no linked teacher profile",
    };
  }

  const resolvedAcademicYearId =
    academicYearId || (await getActiveAcademicYear())?.id;
  if (!resolvedAcademicYearId) {
    return { allowed: false, reason: "No active academic year found" };
  }

  const checkDate = date ? new Date(date) : new Date();
  checkDate.setHours(0, 0, 0, 0); // ignore time of day

  const dayOfWeek = checkDate
    .toLocaleString("en-US", { weekday: "long" })
    .toUpperCase();

  // ─── Step 1: Get student's current classroom & stream ───
  const enrollment = await prisma.studentStream.findFirst({
    where: {
      studentId: Number(studentId),
      academicYearId: resolvedAcademicYearId,
    },
    select: {
      classroomId: true,
      streamId: true,
    },
  });

  if (!enrollment || !enrollment.classroomId) {
    return {
      allowed: false,
      reason: `Student ${studentId} has no active classroom enrollment in ${resolvedAcademicYearId}`,
    };
  }

  const studentClassroomId = enrollment.classroomId;
  const studentStreamId = enrollment.streamId;

  // ─── Step 2: Check if teacher is assigned to THIS classroom + subject ───
  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId,
      classroomId: studentClassroomId, // ← key change
      subjectId: subjectId ? Number(subjectId) : undefined,
      academicYearId: resolvedAcademicYearId,
      status: "ACTIVE",
      OR: [
        { fromDate: null, toDate: null },
        {
          AND: [
            { fromDate: { lte: checkDate } },
            { OR: [{ toDate: null }, { toDate: { gte: checkDate } }] },
          ],
        },
      ],
    },
  });

  if (assignment) {
    // Optional: if assignment has stream → student must match
    if (
      assignment.streamId !== null &&
      studentStreamId !== assignment.streamId
    ) {
      return {
        allowed: false,
        reason: `Student stream (${studentStreamId || "none"}) does not match required stream (${assignment.streamId})`,
      };
    }
    return {
      allowed: true,
      source: "teacher-assignment",
      classroomId: studentClassroomId,
      streamId: assignment.streamId,
    };
  }

  // ─── Step 3: Check timetable for THIS classroom ───
  const slot = await prisma.timetableSlot.findFirst({
    where: {
      academicYearId: resolvedAcademicYearId,
      day: dayOfWeek,
      slotType: "CLASS",
      teacherId,
      classroomId: studentClassroomId, // ← key change
      subjectId: subjectId ? Number(subjectId) : undefined,
    },
  });

  if (slot) {
    // Optional stream check
    if (slot.streamId !== null && studentStreamId !== slot.streamId) {
      return {
        allowed: false,
        reason: `Student stream (${studentStreamId || "none"}) does not match timetable stream (${slot.streamId})`,
      };
    }
    return {
      allowed: true,
      source: "timetable",
      classroomId: studentClassroomId,
      streamId: slot.streamId,
    };
  }

  return {
    allowed: false,
    reason: `Teacher is not assigned to classroom ${studentClassroomId} (student's current class) for this subject on ${checkDate.toISOString().split("T")[0]}`,
  };
};

/**
 * Only ADMIN can update existing attendance records
 */
export const canUpdateAttendance = (req) => {
  if (!req.user) return false;
  return req.user.role === "ADMIN";
};
