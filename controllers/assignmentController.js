import prisma from '../models/prisma.js';

export const createAssignment = async (req, res) => {
  const { 
    title, 
    description, 
    className, 
    fromDate, 
    toDate, 
    fileUrl, 
    schoolId, 
    classroomId 
  } = req.body;

  try {
    // Get staff ID from authenticated user
    let staff = null;
    if (req.user.userId) {
      staff = await prisma.staff.findUnique({
        where: { userId: req.user.userId }
      });
    }

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        className,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        fileUrl,
        school: { connect: { id: parseInt(schoolId, 10) } },
        classroom: { connect: { id: parseInt(classroomId, 10) } },
        createdBy: staff ? { connect: { id: staff.id } } : undefined
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json(assignment);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'School or classroom not found' });
    }
    res.status(500).json({ error: 'Failed to create assignment' });
  }
};

export const getAssignments = async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    schoolId, 
    classroomId, 
    className,
    fromDate,
    toDate
  } = req.query;

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let where = {};

    if (schoolId) {
      where.schoolId = parseInt(schoolId);
    }

    if (classroomId) {
      where.classroomId = parseInt(classroomId);
    }

    if (className) {
      where.className = { contains: className, mode: 'insensitive' };
    }

    if (fromDate) {
      where.fromDate = { gte: new Date(fromDate) };
    }

    if (toDate) {
      where.toDate = { lte: new Date(toDate) };
    }

    const [total, assignments] = await prisma.$transaction([
      prisma.assignment.count({ where }),
      prisma.assignment.findMany({
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
            select: {
              id: true,
              name: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      })
    ]);

    res.json({
      assignments,
      pagination: {
        total,
        pages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        perPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
};

export const getAssignment = async (req, res) => {
  const { id } = req.params;

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            schoolCode: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json(assignment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
};

export const updateAssignment = async (req, res) => {
  const { id } = req.params;
  const { 
    title, 
    description, 
    className, 
    fromDate, 
    toDate, 
    fileUrl, 
    classroomId 
  } = req.body;

  try {
    const data = {};

    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (className !== undefined) data.className = className;
    if (fromDate !== undefined) data.fromDate = new Date(fromDate);
    if (toDate !== undefined) data.toDate = new Date(toDate);
    if (fileUrl !== undefined) data.fileUrl = fileUrl;
    if (classroomId !== undefined) {
      data.classroom = { connect: { id: parseInt(classroomId, 10) } };
    }

    const assignment = await prisma.assignment.update({
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
          select: {
            id: true,
            name: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json(assignment);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    res.status(500).json({ error: 'Failed to update assignment' });
  }
};

export const deleteAssignment = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.assignment.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Assignment deleted successfully' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
};

