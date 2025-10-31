import prisma from '../models/prisma.js';

export const createStudent = async (req, res) => {
  const { name, email, grade, dateOfBirth, schoolId } = req.body;
  try {
    const existingStudent = await prisma.student.findUnique({
      where: { email }
    });

    if (existingStudent) {
      return res.status(400).json({
        error: 'Student with this email already exists'
      });
    }

    const student = await prisma.student.create({
      data: {
        name,
        email,
        grade,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        school: { connect: { id: parseInt(schoolId) } }
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true
          }
        }
      }
    });

    res.status(201).json(student);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create student' });
  }
};

export const getStudents = async (req, res) => {
  const { page = 1, limit = 10, search, schoolId, grade } = req.query;
  console.log(req.user);
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

    if (schoolId) {
      where.schoolId = parseInt(schoolId);
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
  const { id } = req.params;
  try {
    const student = await prisma.student.findUnique({
      where: { id: parseInt(id) },
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
  const { name, email, grade, dateOfBirth, schoolId } = req.body;
  try {
    const student = await prisma.student.update({
      where: { id: parseInt(id) },
      data: {
        name,
        email,
        grade,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        school: schoolId ? { connect: { id: parseInt(schoolId) } } : undefined
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true
          }
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
