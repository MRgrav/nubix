import prisma from '../models/prisma.js';

export const createSchool = async (req, res) => {
  const { name, schoolCode, address } = req.body;
  try {
    const existingSchool = await prisma.school.findFirst({
      where: { OR: [{ name }, { schoolCode }] }
    });

    if (existingSchool) {
      return res.status(400).json({
        error: 'School with this name or code already exists'
      });
    }

    const school = await prisma.school.create({
      data: { name, schoolCode, address },
      include: {
        _count: {
          select: { students: true, staff: true }
        }
      }
    });

    res.status(201).json(school);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create school' });
  }
};

export const getSchools = async (req, res) => {
  const { page = 1, limit = 10, search, sortBy = 'name', order = 'asc' } = req.query;
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { schoolCode: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    const [total, schools] = await prisma.$transaction([
      prisma.school.count({ where }),
      prisma.school.findMany({
        where,
        include: {
          _count: {
            select: { students: true, staff: true }
          }
        },
        orderBy: { [sortBy]: order },
        skip,
        take: parseInt(limit)
      })
    ]);

    res.json({
      schools,
      pagination: {
        total,
        pages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        perPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
};

export const getSchool = async (req, res) => {
  const { id } = req.params;
  try {
    const school = await prisma.school.findUnique({
      where: { id: parseInt(id) },
      include: {
        students: {
          select: {
            id: true,
            name: true,
            email: true,
            grade: true
          }
        },
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json(school);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch school' });
  }
};

export const updateSchool = async (req, res) => {
  const { id } = req.params;
  const { name, schoolCode, address } = req.body;
  try {
    const existingSchool = await prisma.school.findFirst({
      where: {
        OR: [
          { name },
          { schoolCode }
        ],
        NOT: { id: parseInt(id) }
      }
    });

    if (existingSchool) {
      return res.status(400).json({
        error: 'School with this name or code already exists'
      });
    }

    const school = await prisma.school.update({
      where: { id: parseInt(id) },
      data: { name, schoolCode, address },
      include: {
        _count: {
          select: { students: true, staff: true }
        }
      }
    });

    res.json(school);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'School not found' });
    }
    res.status(500).json({ error: 'Failed to update school' });
  }
};

export const deleteSchool = async (req, res) => {
  const { id } = req.params;
  try {
    const school = await prisma.school.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: { students: true, staff: true }
        }
      }
    });

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    if (school._count.students > 0 || school._count.staff > 0) {
      return res.status(400).json({
        error: 'Cannot delete school with existing students or staff'
      });
    }

    await prisma.school.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'School deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete school' });
  }
};
