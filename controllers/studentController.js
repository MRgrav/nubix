import prisma from '../models/prisma.js';
import bcrypt from 'bcryptjs';

const generateSecurePassword = () => {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '@#$%&';
  let password = '';
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));
  const allChars = uppercase + lowercase + numbers;
  for (let i = 0; i < 4; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

export const createStudent = async (req, res) => {
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
    schoolCode,
    classroomId, 
    subjectIds 
  } = req.body;
  try {
    const existingStudent = await prisma.student.findUnique({ where: { email } });
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingStudent) {
      return res.status(400).json({
        error: 'Student with this email already exists'
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      let resolvedSchoolId;
      if (schoolCode) {
        const school = await tx.school.findUnique({ where: { schoolCode } });
        if (!school) {
          const err = new Error('School not found');
          err.code = 'SCHOOL_NOT_FOUND';
          throw err;
        }
        resolvedSchoolId = school.id;
      } else if (schoolId) {
        const s = String(schoolId);
        if (s.length === 4 && s.startsWith('0')) {
          const school = await tx.school.findUnique({ where: { schoolCode: s } });
          if (!school) {
            const err = new Error('School not found');
            err.code = 'SCHOOL_NOT_FOUND';
            throw err;
          }
          resolvedSchoolId = school.id;
        } else {
          resolvedSchoolId = parseInt(schoolId);
        }
      }

      let userId;
      if (!existingUser) {
        const tempPassword = generateSecurePassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            role: 'STUDENT',
            schoolId: resolvedSchoolId
          }
        });
        userId = user.id;
        req.generatedPassword = tempPassword;
      } else {
        userId = existingUser.id;
      }

      const data = {
        name,
        email,
        grade,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        previousSchoolName,
        previousClass,
        previousGrade,
        promotedToClass,
        totalAdmissionAmount: totalAdmissionAmount !== undefined && totalAdmissionAmount !== null ? parseFloat(totalAdmissionAmount) : undefined,
        monthlyFees: monthlyFees !== undefined && monthlyFees !== null ? parseFloat(monthlyFees) : undefined,
        admissionDate: admissionDate ? new Date(admissionDate) : null,
        admissionReceiptNo,
        admissionReceiptLink,
        school: resolvedSchoolId ? { connect: { id: resolvedSchoolId } } : undefined,
        user: userId ? { connect: { id: userId } } : undefined
      };

      if (classroomId !== undefined && classroomId !== null) {
        const classroom = await tx.classroom.findUnique({ where: { id: parseInt(classroomId) } });
        if (classroom) {
          data.classroom = { connect: { id: classroom.id } };
        }
      }

      if (Array.isArray(subjectIds) && subjectIds.length) {
        const subjectIdInts = subjectIds.map((s) => parseInt(s));
        const existingSubjects = await tx.subject.findMany({
          where: { id: { in: subjectIdInts } },
          select: { id: true }
        });
        if (existingSubjects.length) {
          data.subjects = { connect: existingSubjects.map((s) => ({ id: s.id })) };
        }
      }

      const created = await tx.student.create({
        data,
        include: {
          school: { select: { id: true, name: true, schoolCode: true } },
          classroom: { select: { id: true, name: true } },
          subjects: { select: { id: true, name: true, code: true } }
        }
      });

      const rollNo = `ROLL${1000 + created.id}`;
      const student = await tx.student.update({
        where: { id: created.id },
        data: { rollNo },
        include: {
          school: { select: { id: true, name: true, schoolCode: true } },
          classroom: { select: { id: true, name: true } },
          subjects: { select: { id: true, name: true, code: true } }
        }
      });

      return student;
    });

    res.status(201).json({
      ...result,
      temporaryPassword: req.generatedPassword || undefined
    });
  } catch (err) {
    console.error(err);
    if (err.code === 'SCHOOL_NOT_FOUND') {
      return res.status(404).json({ error: 'School not found' });
    }
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create student' });
  }
};

export const getStudents = async (req, res) => {
  const { page = 1, limit = 10, search, schoolId, schoolCode, schoolcode, grade } = req.query;
  const isAdmin = req.user?.role === 'ADMIN';
  
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { grade: { contains: search, mode: 'insensitive' } }
      ];
    }

    const sc = schoolCode ?? schoolcode;
    if (sc) {
      where.school = { is: { schoolCode: String(sc).trim() } };
    } else if (schoolId) {
      const s = String(schoolId);
      if (s.length === 4 && s.startsWith('0')) {
        where.school = { is: { schoolCode: s } };
      } else {
        where.schoolId = parseInt(schoolId);
      }
    }

    if (grade) {
      where.grade = grade;
    }

    const [total, students] = await prisma.$transaction([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        include: {
            school: {
              select: {
                id: true,
                name: true,
                schoolCode: true
              }
            },
            classroom: {
              select: { id: true, name: true }
            },
            user: isAdmin ? {
              select: {
                email: true,
                role: true,
              }
            } : {
              select: {
                email: true,
                role: true
              }
            }
          },
        orderBy: { name: 'asc' },
        skip,
        take: parseInt(limit)
      })
    ]);

    res.json({
      students,
      pagination: {
        total,
        pages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        perPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
};

export const getStudent = async (req, res) => {
  const { id } = req.query;
  const { email, rollNo } = req.query;
  try {
    let where;
    if (id) {
      where = { id: parseInt(id) };
    } else if (email) {
      where = { email };
    } else if (rollNo) {
      where = { rollNo };
    }

    if (!where) {
      return res.status(400).json({ error: 'Provide id, email, or rollNo to fetch student' });
    }

    const student = await prisma.student.findUnique({
      where,
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true
          }
        },
        classroom: {
          select: { id: true, name: true }
        },
        user: {
          select: {
            email: true,
            role: true
          }
        }
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
};

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
    subjectIds 
  } = req.body;
  try {
    const data = {
      name,
      email,
      grade,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender,
      previousSchoolName,
      previousClass,
      previousGrade,
      promotedToClass,
      totalAdmissionAmount: totalAdmissionAmount !== undefined && totalAdmissionAmount !== null ? parseFloat(totalAdmissionAmount) : undefined,
      monthlyFees: monthlyFees !== undefined && monthlyFees !== null ? parseFloat(monthlyFees) : undefined,
      admissionDate: admissionDate ? new Date(admissionDate) : undefined,
      admissionReceiptNo,
      admissionReceiptLink,
      school: schoolId ? { connect: { id: parseInt(schoolId) } } : undefined
    };

    // classroom replace semantics: connect / disconnect
    if (classroomId === null) {
      data.classroom = { disconnect: true };
    } else if (classroomId !== undefined) {
      data.classroom = { connect: { id: parseInt(classroomId) } };
    }

    // If subjectIds provided, replace the student's subjects
    if (Array.isArray(subjectIds)) {
      data.subjects = { set: subjectIds.map((s) => ({ id: parseInt(s) })) };
    }

    const student = await prisma.student.update({
      where: { id: parseInt(id) },
      data,
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true
          }
        },
        classroom: {
          select: { id: true, name: true }
        },
        subjects: {
          select: { id: true, name: true, code: true }
        }
      }
    });

    res.json(student);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Student not found' });
    }
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update student' });
  }
};

export const updateStudentProfile = async (req, res) => {
  const { id } = req.params;
  const { name, dateOfBirth } = req.body;
  const userId = req.user.id;
  console.log(req.params);
  try {
    // First, verify that the student exists and belongs to the logged-in user
    const student = await prisma.student.findFirst({
      where: {
        id: parseInt(id),
        user: {
          id: userId
        }
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true
          }
        },
        user: {
          select: {
            email: true,
            role: true
          }
        }
      }
    });
    console.log(student);
    if (!student) {
      return res.status(403).json({ 
        error: 'Access denied. You can only update your own profile.' 
      });
    }

    // Validate date format if provided
    let parsedDate = undefined;
    if (dateOfBirth) {
      parsedDate = new Date(dateOfBirth);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ 
          error: 'Invalid date format. Please use YYYY-MM-DD format.' 
        });
      }
    }

    // Update only allowed fields for student self-update
    const updatedStudent = await prisma.student.update({
      where: { id: parseInt(id) },
      data: {
        name: name || undefined,  // Only update if provided
        dateOfBirth: parsedDate
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true
          }
        },
        user: {
          select: {
            email: true,
            role: true
          }
        }
      }
    });

    res.json({
      message: 'Profile updated successfully',
      student: {
        id: updatedStudent.id,
        name: updatedStudent.name,
        email: updatedStudent.user.email,
        dateOfBirth: updatedStudent.dateOfBirth,
        school: updatedStudent.school
      }
    });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const deleteStudent = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.student.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.status(500).json({ error: 'Failed to delete student' });
  }
};
