import prisma from '../models/prisma.js';
import bcrypt from 'bcryptjs';
import { generateSecurePassword } from './authController.js';

const OPTIONAL_STRING_FIELDS = [
  'employeeId',
  'title',
  'name',
  'gender',
  'employeeType',
  'role',
  'designation',
  'fatherHusbandName',
  'qualification',
  'address',
  'city',
  'state',
  'pincode',
  'location',
  'aadharNumber',
  'panNumber',
  'mobile',
  'alternateMobile',
  'email',
  'alternateEmail',
  'brokerBranch',
  'bankName',
  'bankBranchName',
  'bankAccountNumber',
  'ifscCode',
  'jobOfferLetterUrl',
  'joiningLetterUrl',
  'ndaUrl',
  'experienceLetterUrl',
  'relievingLetterUrl',
  'salarySlipUrl',
  'aadhaarCardUrl',
  'panCardUrl',
  'cancelledChequeUrl',
  'passportUrl',
  'sscCertificateUrl',
  'hscCertificateUrl',
  'graduationCertificateUrl'
];

const sanitizeString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const parseDateField = (value, field) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`Invalid ${field}`);
    error.code = 'INVALID_DATE';
    error.meta = { field };
    throw error;
  }
  return parsed;
};

const buildStaffPayload = (body) => {
  const data = {};

  OPTIONAL_STRING_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = sanitizeString(body[field]);
    }
  });

  const dateOfBirth = parseDateField(body.dateOfBirth, 'dateOfBirth');
  if (dateOfBirth !== undefined) {
    data.dateOfBirth = dateOfBirth;
  }

  const dateOfJoining = parseDateField(body.dateOfJoining, 'dateOfJoining');
  if (dateOfJoining !== undefined) {
    data.dateOfJoining = dateOfJoining;
  }

  return data;
};

export const createStaff = async (req, res) => {
  const { schoolId, email } = req.body;
  
  if (!email || !schoolId) {
    return res.status(400).json({ error: 'Email and School ID are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered in system' });
    }

    const existingStaff = await prisma.staff.findUnique({
      where: { email }
    });

    if (existingStaff) {
      return res.status(400).json({
        error: 'Staff member with this email already exists'
      });
    }

    const staffData = buildStaffPayload(req.body);
    
    // Generate password
    const password = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // Create User
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          role: 'STAFF',
          schoolId: parseInt(schoolId, 10)
        }
      });

      // Create Staff linked to User
      staffData.school = { connect: { id: parseInt(schoolId, 10) } };
      staffData.user = { connect: { id: user.id } };

      const staff = await tx.staff.create({
        data: staffData,
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
              id: true,
              email: true,
              role: true
            }
          }
        }
      });
      
      return staff;
    });

    res.status(201).json({ ...result, generatedPassword: password });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email or employee ID already exists' });
    }
    if (err.code === 'INVALID_DATE') {
      return res.status(400).json({ error: err.message, field: err.meta?.field });
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
  try {
    const staffData = buildStaffPayload(req.body);

    if (req.body.schoolId) {
      staffData.school = { connect: { id: parseInt(req.body.schoolId, 10) } };
    }

    const staff = await prisma.staff.update({
      where: { id: parseInt(id, 10) },
      data: staffData,
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
      return res.status(400).json({ error: 'Email or employee ID already exists' });
    }
    if (err.code === 'INVALID_DATE') {
      return res.status(400).json({ error: err.message, field: err.meta?.field });
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
