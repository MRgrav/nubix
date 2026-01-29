import prisma from '../models/prisma.js';

/**
 * Get table name for attendance based on academic year
 * Format: Attendance_2025_2026
 */
export const getAttendanceTableName = (academicYearLabel) => {
  // Convert "2025-2026" to "Attendance_2025_2026"
  const sanitized = academicYearLabel.replace(/[^0-9-]/g, '').replace(/-/g, '_');
  return `Attendance_${sanitized}`;
};

/**
 * Get or create attendance table for an academic year
 * Creates the table if it doesn't exist
 */
export const ensureAttendanceTable = async (academicYearLabel) => {
  const tableName = getAttendanceTableName(academicYearLabel);
  
  // Check if table exists
  const tableExistsResult = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    tableName
  );

  if (!tableExistsResult[0].exists) {
    // Create table with same structure as Attendance model
    const quotedTableName = `"${tableName}"`;
    await prisma.$executeRawUnsafe(`
      CREATE TABLE ${quotedTableName} (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
        note TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "studentId" INTEGER REFERENCES "Student"(id) ON DELETE CASCADE,
        "staffId" INTEGER REFERENCES "Staff"(id) ON DELETE CASCADE,
        "academicYearId" INTEGER NOT NULL REFERENCES "AcademicYear"(id) ON DELETE CASCADE,
        "subjectId" INTEGER REFERENCES "Subject"(id) ON DELETE SET NULL,
        CONSTRAINT "${tableName}_student_unique" UNIQUE ("studentId", date, "academicYearId", "subjectId"),
        CONSTRAINT "${tableName}_staff_unique" UNIQUE ("staffId", date, "academicYearId")
      )
    `);

    await prisma.$executeRawUnsafe(`CREATE INDEX "${tableName}_student_idx" ON ${quotedTableName}("studentId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "${tableName}_staff_idx" ON ${quotedTableName}("staffId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "${tableName}_date_idx" ON ${quotedTableName}(date)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "${tableName}_academic_year_idx" ON ${quotedTableName}("academicYearId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "${tableName}_subject_idx" ON ${quotedTableName}("subjectId")`);
  }

  return `"${tableName}"`;
};

/**
 * Get academic year label from ID
 */
export const getAcademicYearLabel = async (academicYearId) => {
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { label: true }
  });
  return academicYear?.label;
};

/**
 * Insert attendance into year-specific table
 */
export const insertAttendance = async (data, academicYearLabel) => {
  const tableName = await ensureAttendanceTable(academicYearLabel);
  
  const { studentId, staffId, date, status, note, academicYearId, subjectId } = data;
  
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
    subjectId || null
  );

  return result[0];
};

/**
 * Query attendance from year-specific table
 */
export const queryAttendance = async (where, academicYearLabel, options = {}) => {
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
 * Update attendance in year-specific table
 */
export const updateAttendance = async (id, data, academicYearLabel) => {
  const tableName = await ensureAttendanceTable(academicYearLabel);
  
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(data.status);
  }

  if (data.date !== undefined) {
    updates.push(`date = $${paramIndex++}`);
    params.push(data.date);
  }

  if (data.note !== undefined) {
    updates.push(`note = $${paramIndex++}`);
    params.push(data.note);
  }

  if (data.subjectId !== undefined) {
    updates.push(`"subjectId" = $${paramIndex++}`);
    params.push(data.subjectId || null);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  params.push(id);

  const result = await prisma.$queryRawUnsafe(
    `UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    ...params
  );

  return result.length > 0 ? result[0] : null;
};

/**
 * Delete attendance from year-specific table
 */
export const deleteAttendanceRecord = async (id, academicYearLabel) => {
  const tableName = await ensureAttendanceTable(academicYearLabel);
  
  await prisma.$executeRawUnsafe(
    `DELETE FROM ${tableName} WHERE id = $1`,
    id
  );
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
 * Bulk insert attendance records into year-specific table
 * Uses batch insert for better performance
 */
export const bulkInsertAttendance = async (records, academicYearLabel) => {
  if (!records || records.length === 0) {
    return { inserted: 0, updated: 0, errors: [] };
  }

  const tableName = await ensureAttendanceTable(academicYearLabel);
  const results = { inserted: 0, updated: 0, errors: [] };

  // Process in batches to avoid query size limits
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    try {
      // Build values for batch insert
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const record of batch) {
        const { studentId, staffId, date, status, note, academicYearId, subjectId } = record;
        values.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, CURRENT_TIMESTAMP)`
        );
        params.push(
          date,
          status,
          note || null,
          studentId || null,
          staffId || null,
          academicYearId,
          subjectId || null
        );
      }

      // Use ON CONFLICT to handle duplicates (update if exists)
      // For student attendance, use the student unique constraint
      const query = `
        INSERT INTO ${tableName} 
        (date, status, note, "studentId", "staffId", "academicYearId", "subjectId", "createdAt")
        VALUES ${values.join(', ')}
        ON CONFLICT ("studentId", date, "academicYearId", "subjectId") 
        WHERE "studentId" IS NOT NULL
        DO UPDATE SET 
          status = EXCLUDED.status,
          note = EXCLUDED.note
        RETURNING id, "studentId", "staffId"
      `;

      const result = await prisma.$queryRawUnsafe(query, ...params);
      results.inserted += result.length;
    } catch (err) {
      // If batch fails, try individual inserts
      for (const record of batch) {
        try {
          // Check if exists first
          const existing = await attendanceExists(
            {
              studentId: record.studentId,
              staffId: record.staffId,
              date: record.date,
              academicYearId: record.academicYearId,
              subjectId: record.subjectId,
            },
            academicYearLabel
          );

          if (existing) {
            await updateAttendance(existing.id, { status: record.status, note: record.note }, academicYearLabel);
            results.updated++;
          } else {
            await insertAttendance(record, academicYearLabel);
            results.inserted++;
          }
        } catch (error) {
          results.errors.push({
            record,
            error: error.message,
          });
        }
      }
    }
  }

  return results;
};

