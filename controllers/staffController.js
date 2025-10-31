import prisma from '../models/prisma.js';

export const createStaff = async (req, res) => {
  const { name, email, role, schoolId } = req.body;
  try {
    const existingStaff = await prisma.staff.findUnique({
      where: { email }
    });

    if (existingStaff) {
      return res.status(400).json({
        error: 'Staff member with this email already exists'
      });
    }

    const staff = await prisma.staff.create({
      data: {
        name,
        email,
        role,
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

    res.status(201).json(staff);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create staff member' });
  }
};

export const getStaff = async (req, res) => {
  const { page = 1, limit = 10, search, schoolId, role } = req.query;
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { role: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (schoolId) {
      where.schoolId = parseInt(schoolId);
    }

    if (role) {
      where.role = role;
    }

    const [total, staff] = await prisma.$transaction([
      prisma.staff.count({ where }),
      prisma.staff.findMany({
        where,
        include: {
          school: {
            select: {
              id: true,
              name: true,
              schoolCode: true
            }
          }
        },
        orderBy: { name: 'asc' },
        skip,
        take: parseInt(limit)
      })
    ]);

    res.json({
      staff,
      pagination: {
        total,
        pages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        perPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
};

export const getStaffMember = async (req, res) => {
  const { id } = req.params;
  try {
    const staff = await prisma.staff.findUnique({
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

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch staff member' });
  }
};

export const updateStaffMember = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, schoolId } = req.body;
  try {
    const staff = await prisma.staff.update({
      where: { id: parseInt(id) },
      data: {
        name,
        email,
        role,
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

    res.json(staff);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update staff member' });
  }
};

export const deleteStaffMember = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.staff.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Staff member deleted successfully' });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    res.status(500).json({ error: 'Failed to delete staff member' });
  }
};
