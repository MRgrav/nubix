import prisma from "../models/prisma.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { generateRollNo } from "../utils/rollNoGenerator.js";
import { getActiveAcademicYear } from "./../utils/academicYearHelper.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";

// Zod schema for createStudent validation
const createStudentSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email format"),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    dateOfBirth: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          return (
            !isNaN(Date.parse(val)) || // ISO
            /^\d{2}\/\d{2}\/\d{4}$/.test(val) // DD/MM/YYYY
          );
        },
        { message: "Invalid date format (ISO or DD/MM/YYYY)" },
      ),

    schoolId: z.number().int().positive("Invalid school ID"),
    grade: z.string().optional(),
    previousSchoolName: z.string().optional(),
    previousClass: z.string().optional(),
    previousGrade: z.string().optional(),
    promotedToClass: z.string().optional(),
    totalAdmissionAmount: z.number().optional(),
    monthlyFees: z.number().optional(),
    admissionDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date",
      })
      .optional(),
    admissionReceiptNo: z.string().optional(),
    admissionReceiptLink: z.string().url().optional(),
    academicYearId: z.number().int().positive().optional(),
    classroomId: z.number().int().positive().optional(),
    streamId: z.number().int().positive().optional(),
    rollNo: z.string().optional(),
    parents: z
      .array(
        z.object({
          type: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]),
          name: z.string().min(1),
          email: z.string().email(),
          phone: z.string().optional(),
          address: z.string().optional(),
          isPrimary: z.boolean().optional(),
        }),
      )
      .optional(),
  })
  .refine(
    (data) => {
      if (data.classroomId && data.streamId) {
        // We'll validate class number in controller using real classroom
        return true;
      }
      return true;
    },
    { message: "Stream requires valid classroom assignment" },
  );

const generateSecurePassword = () => {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnpqrstuvwxyz";
  const numbers = "23456789";
  const special = "@#$%&";
  let password = "";
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));
  const allChars = uppercase + lowercase + numbers;
  for (let i = 0; i < 4; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  return password
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
};

export const createStudent = async (req, res) => {
  try {
    const validated = createStudentSchema.parse(req.body);

    const {
      name,
      email,
      gender,
      dateOfBirth,
      schoolId,
      grade,
      previousSchoolName,
      previousClass,
      previousGrade,
      promotedToClass,
      totalAdmissionAmount,
      monthlyFees,
      admissionDate,
      admissionReceiptNo,
      admissionReceiptLink,
      academicYearId,
      classroomId,
      streamId,
      rollNo,
      parents,
    } = validated;

    if (classroomId && streamId) {
      // Fetch the classroom to get its actual name
      const targetClassroom = await prisma.classroom.findUnique({
        where: { id: parseInt(classroomId) },
        select: { name: true },
      });

      if (!targetClassroom) {
        return sendError(res, 404, "Classroom not found", "NOT_FOUND");
      }

      // Extract numeric class (handles "Class 11", "11", "XI", etc.)
      const className = targetClassroom.name.trim().toLowerCase();
      const classNumberMatch = className.match(/(\d{1,2}|xi|xii)/i);
      const classNum = classNumberMatch
        ? classNumberMatch[1].toLowerCase() === "xi"
          ? 11
          : classNumberMatch[1].toLowerCase() === "xii"
            ? 12
            : parseInt(classNumberMatch[1])
        : null;

      if (!classNum || ![11, 12].includes(classNum)) {
        return sendError(
          res,
          400,
          "Stream can only be assigned to Class 11 or Class 12",
          "INVALID_STREAM_SCOPE",
          {
            classroomName: targetClassroom.name,
            detectedClass: classNum || "unknown",
          },
        );
      }
    }
    // Check duplicate email
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return sendError(
        res,
        409,
        `Email ${email} is already used by another student`,
        "EMAIL_CONFLICT",
      );
    }

    // Generate secure temporary password
    const tempPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User account
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          role: "STUDENT",
          schoolId: parseInt(schoolId),
        },
      });

      // 2. Create Student profile
      const student = await tx.student.create({
        data: {
          name: name.trim(),
          email,
          gender,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          grade: grade || null,
          previousSchoolName,
          previousClass,
          previousGrade,
          promotedToClass,
          totalAdmissionAmount: totalAdmissionAmount
            ? parseFloat(totalAdmissionAmount)
            : null,
          monthlyFees: monthlyFees ? parseFloat(monthlyFees) : null,
          admissionDate: admissionDate ? new Date(admissionDate) : null,
          admissionReceiptNo,
          admissionReceiptLink,
          school: { connect: { id: parseInt(schoolId) } },
          user: { connect: { id: user.id } },
        },
        include: {
          school: { select: { id: true, name: true, schoolCode: true } },
        },
      });

      let enrollment = null;

      // 3. If classroomId is provided → enroll student (with stream if given)
      if (classroomId) {
        // Resolve academic year
        let ayId = academicYearId ? parseInt(academicYearId) : null;
        if (!ayId) {
          const active = await getActiveAcademicYear(parseInt(schoolId));
          if (!active) {
            throw new Error("No active academic year found for this school");
          }
          ayId = active.id;
        }

        // Generate unique rollNo
        const finalRollNo =
          rollNo ||
          (await generateRollNo(tx, {
            academicYearId: ayId,
            classroomId: parseInt(classroomId),
            streamId: streamId ? parseInt(streamId) : null,
            schoolId: parseInt(schoolId),
          }));

        // Create StudentStream
        enrollment = await tx.studentStream.create({
          data: {
            studentId: student.id,
            academicYearId: ayId,
            classroomId: parseInt(classroomId),
            streamId: streamId ? parseInt(streamId) : null,
            rollNo: finalRollNo,
          },
          include: {
            classroom: { select: { id: true, name: true, section: true } },
            stream: streamId ? { select: { id: true, name: true } } : false,
            academicYear: { select: { id: true, label: true } },
          },
        });

        // Update student's classroomId
        await tx.student.update({
          where: { id: student.id },
          data: { classroomId: parseInt(classroomId) },
        });
      }

      // Optional: Create and link parents
      // Parent linking (re-use existing)
      let createdParents = [];
      if (parents?.length) {
        for (const p of parents) {
          let parentUser = await tx.user.findUnique({
            where: { email: p.email },
          });

          let parent;
          if (parentUser) {
            // Reuse existing parent
            parent = await tx.parent.findFirst({
              where: { userId: parentUser.id },
            });
            if (!parent) {
              parent = await tx.parent.create({
                data: {
                  type: p.type,
                  name: p.name.trim(),
                  email: p.email,
                  phone: p.phone,
                  address: p.address,
                  user: { connect: { id: parentUser.id } },
                },
              });
            }
          } else {
            // Create new parent + user
            const tempParentPass = generateSecurePassword();
            const parentHash = await bcrypt.hash(tempParentPass, 10);

            parentUser = await tx.user.create({
              data: {
                email: p.email,
                password: parentHash,
                role: "PARENT",
              },
            });

            parent = await tx.parent.create({
              data: {
                type: p.type,
                name: p.name.trim(),
                email: p.email,
                phone: p.phone,
                address: p.address,
                user: { connect: { id: parentUser.id } },
              },
            });

            createdParents.push({
              name: p.name,
              email: p.email,
              temporaryPassword: tempParentPass,
            });
          }

          // Link to student (safe: upsert to avoid duplicate links)
          await tx.studentParent.upsert({
            where: {
              studentId_parentId: {
                studentId: student.id,
                parentId: parent.id,
              },
            },
            update: { isPrimary: p.isPrimary || false },
            create: {
              studentId: student.id,
              parentId: parent.id,
              isPrimary: p.isPrimary || false,
            },
          });
        }
      }

      return { user, student, enrollment, tempPassword, createdParents };
    });

    // Success response
    res.status(201).json({
      message:
        "Student created successfully" +
        (result.enrollment ? " and enrolled" : ""),
      student: result.student,
      enrollment: result.enrollment,
      temporaryPassword: result.tempPassword,
      createdParents: result.createdParents.length
        ? result.createdParents
        : undefined,
      note: "Please securely share the temporary password with the student/parent",
    });
  } catch (err) {
    console.error("Student creation failed:", err);

    if (err instanceof z.ZodError) {
      const issues = err.errors.map((e) => e.message).join(", ");
      return sendError(
        res,
        400,
        `Validation failed: ${issues}`,
        "VALIDATION_ERROR",
      );
    }

    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Duplicate entry (email or roll number conflict)",
        "DUPLICATE_ENTRY",
      );
    }

    if (err.message?.includes("No active academic year")) {
      return sendError(res, 400, err.message, "ACADEMIC_YEAR_ERROR");
    }

    return sendError(res, 500, "Failed to create student", "INTERNAL_ERROR");
  }
};

export const getStudents = async (req, res) => {
  const {
    schoolId,
    grade,
    classroomId,
    academicYearId,
    streamId,
    page = 1,
    limit = 20,
    search,
    include = "school,classroom",
  } = req.query;

  try {
    // Force parents to only see their selected child
    if (req.user.role === "PARENT") {
      const actingId = req.user.actingAsStudentId;
      if (!actingId) {
        return sendError(
          res,
          403,
          "Select a child first",
          "CHILD_NOT_SELECTED",
        );
      }
      where.id = actingId; // Only return selected child
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (schoolId) where.schoolId = parseInt(schoolId);
    if (grade) where.grade = grade;

    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    if (classroomId || academicYearId || streamId) {
      where.studentStreams = {
        some: {
          ...(academicYearId && { academicYearId: parseInt(academicYearId) }),
          ...(classroomId && { classroomId: parseInt(classroomId) }),
          ...(streamId && { streamId: parseInt(streamId) }),
        },
      };
    }

    // Get total count for pagination metadata
    const total = await prisma.student.count({ where });

    const includes = (include || "").split(",").map((s) => s.trim());

    // Fetch paginated students
    const students = await prisma.student.findMany({
      where,
      skip,
      take: limitNum,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: { select: { id: true, name: true, section: true } },
        studentStreams: {
          include: {
            academicYear: { select: { label: true } },
            stream: { select: { name: true } },
          },
          orderBy: { academicYear: { startDate: "desc" } },
        },
      },
      orderBy: [{ name: "asc" }],
    });

    // Pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.json({
      success: true,
      data: students,
      pagination: {
        total,
        totalPages,
        currentPage: pageNum,
        perPage: limitNum,
        hasNext,
        hasPrev,
      },
    });
  } catch (err) {
    console.error("Failed to fetch students:", err);
    res.status(500).json({ error: "Failed to fetch students" });
  }
};

export const getStudent = async (req, res) => {
  const { id } = req.params;

  try {
    const student = await prisma.student.findUnique({
      where: { id: parseInt(id) },
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: true,
        user: { select: { id: true, email: true, role: true } },
        studentStreams: {
          include: {
            academicYear: true,
            classroom: true,
            stream: true,
          },
          orderBy: { academicYear: { startDate: "desc" } },
        },
        examinationResults: {
          include: { examination: true },
          orderBy: { createdAt: "desc" },
        },
        attendances: {
          orderBy: { date: "desc" },
          take: 30, // last 30 days
        },
      },
    });

    if (!student) {
      return sendError(res, 404, "Student not found", "NOT_FOUND");
    }

    return sendSuccess(res, 200, student, "Student fetched successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch student", "INTERNAL_ERROR");
  }
};

/**
 * Update student (admin/staff only)
 */
export const updateStudent = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    email,
    grade,
    dateOfBirth,
    gender,
    previousSchoolName,
    previousClass,
    previousGrade,
    promotedToClass,
    totalAdmissionAmount,
    monthlyFees,
    admissionDate,
    admissionReceiptNo,
    admissionReceiptLink,
    schoolId,
    classroomId,
    subjectIds,
  } = req.body;

  try {
    const data = {
      name: name?.trim(),
      email: email?.trim(),
      grade,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      previousSchoolName,
      previousClass,
      previousGrade,
      promotedToClass,
      totalAdmissionAmount:
        totalAdmissionAmount !== undefined && totalAdmissionAmount !== null
          ? parseFloat(totalAdmissionAmount)
          : undefined,
      monthlyFees:
        monthlyFees !== undefined && monthlyFees !== null
          ? parseFloat(monthlyFees)
          : undefined,
      admissionDate: admissionDate ? new Date(admissionDate) : undefined,
      admissionReceiptNo,
      admissionReceiptLink,
      school: schoolId ? { connect: { id: parseInt(schoolId) } } : undefined,
    };

    // Classroom handling (replace / remove)
    if (classroomId === null) {
      data.classroom = { disconnect: true };
    } else if (classroomId !== undefined) {
      data.classroom = { connect: { id: parseInt(classroomId) } };
    }

    // Replace subjects if array provided
    if (Array.isArray(subjectIds)) {
      data.subjects = {
        set: subjectIds.map((s) => ({ id: parseInt(s) })),
      };
    }

    const student = await prisma.student.update({
      where: { id: parseInt(id) },
      data,
      include: {
        school: { select: { id: true, name: true, schoolCode: true } },
        classroom: true,
        subjects: { select: { id: true, name: true, code: true } },
      },
    });

    res.json(student);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Student not found" });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Failed to update student" });
  }
};

/**
 * Self-update profile (student only - limited fields)
 */
export const updateStudentProfile = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { name, dateOfBirth } = req.body;

  try {
    // Security: Only allow update own profile
    const student = await prisma.student.findFirst({
      where: {
        id: parseInt(id),
        userId,
      },
    });

    if (!student) {
      return res.status(403).json({
        error: "You can only update your own profile",
      });
    }

    let parsedDate = undefined;
    if (dateOfBirth) {
      parsedDate = new Date(dateOfBirth);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Use YYYY-MM-DD",
        });
      }
    }

    const updated = await prisma.student.update({
      where: { id: parseInt(id) },
      data: {
        name: name?.trim(),
        dateOfBirth: parsedDate,
      },
      include: {
        school: { select: { name: true } },
        user: { select: { email: true } },
      },
    });

    res.json({
      message: "Profile updated successfully",
      student: {
        id: updated.id,
        name: updated.name,
        email: updated.user.email,
        dateOfBirth: updated.dateOfBirth,
        school: updated.school?.name,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

/**
 * Delete student (admin only)
 */
export const deleteStudent = async (req, res) => {
  const { id } = req.params;

  try {
    // Optional: You might want to soft-delete or cascade check
    await prisma.$transaction([
      prisma.studentStream.deleteMany({ where: { studentId: parseInt(id) } }),
      prisma.student.delete({ where: { id: parseInt(id) } }),
      // Add more if needed (examinationResults, attendances etc.)
    ]);

    res.json({ message: "Student and related records deleted successfully" });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Student not found" });
    }
    res.status(500).json({ error: "Failed to delete student" });
  }
};

export const getTeachersForStudent = async (req, res) => {
  const { studentId } = req.params;
  const { page = 1, limit = 10, academicYearId } = req.query;

  if (req.user.role === "PARENT") {
    const actingStudentId = req.user.actingAsStudentId;
    if (!actingStudentId || parseInt(studentId) !== actingStudentId) {
      return sendError(
        res,
        403,
        "You can only fetch teachers for your selected child",
        "FORBIDDEN",
      );
    }
  } else if (req.user.role === "STUDENT") {
    // Student can only fetch for themselves
    const studentRecord = await prisma.student.findFirst({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!studentRecord || parseInt(studentId) !== studentRecord.id) {
      return sendError(
        res,
        403,
        "You can only fetch teachers for yourself",
        "FORBIDDEN",
      );
    }
  } else {
    // Staff/Admin can fetch for any student
    if (!["STAFF", "ADMIN"].includes(req.user.role)) {
      return sendError(res, 403, "Unauthorized", "FORBIDDEN");
    }
  }

  try {
    let resolvedAcademicYearId = academicYearId;
    if (!resolvedAcademicYearId) {
      const activeYear = await getActiveAcademicYear(req.user.schoolId);
      resolvedAcademicYearId = activeYear?.id;
    }

    const studentStream = await prisma.studentStream.findFirst({
      where: {
        studentId: parseInt(studentId),
        academicYearId: parseInt(resolvedAcademicYearId),
      },
      select: { classroomId: true, streamId: true },
    });

    if (!studentStream) {
      return sendError(
        res,
        404,
        "No enrollment found for student in this year",
        "NOT_FOUND",
      );
    }

    const where = {
      teacherAssignments: {
        some: {
          classroomId: studentStream.classroomId,
          ...(studentStream.streamId && { streamId: studentStream.streamId }),
        },
      },
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, teachers] = await prisma.$transaction([
      prisma.staff.count({ where }),
      prisma.staff.findMany({
        where,
        skip,
        take,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true, // TEACHER, PRINCIPAL, etc.
          // Add more fields as needed for PTM scheduling
        },
      }),
    ]);

    return sendSuccess(res, 200, teachers, "Teachers fetched successfully", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error("Get teachers for student error:", err);
    return sendError(res, 500, "Failed to fetch teachers", "INTERNAL_ERROR");
  }
};
