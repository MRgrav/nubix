import { body, validationResult } from 'express-validator';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export const createUserValidation = [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('name').notEmpty().withMessage('Name is required'),
  body('role').isIn(['STUDENT', 'STAFF']).withMessage('Role must be either STUDENT or STAFF'),
  body('schoolId').isInt().withMessage('Valid school ID is required'),
  body('staffRole')
    .optional()
    .isIn(['TEACHER', 'PRINCIPAL', 'COUNSELOR', 'ADMINISTRATOR'])
    .withMessage('Invalid staff role'),
  validateRequest
];

export const loginValidation = [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').exists().withMessage('Password is required'),
  validateRequest
];

export const schoolValidation = [
  body('name').notEmpty().withMessage('School name is required'),
  body('schoolCode')
    .isLength({ min: 4, max: 4 })
    .withMessage('School code must be exactly 4 characters'),
  body('address').optional(),
  validateRequest
];

export const studentValidation = [
  body('name').notEmpty().withMessage('Student name is required'),
  body('email').isEmail().withMessage('Must be a valid email'),
  body('grade').optional(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('gender').optional(),
  body('previousSchoolName').optional(),
  body('previousClass').optional(),
  body('previousGrade').optional(),
  body('promotedToClass').optional(),
  body('totalAdmissionAmount').optional().isFloat().withMessage('Total admission amount must be a number'),
  body('monthlyFees').optional().isFloat().withMessage('Monthly fees must be a number'),
  body('admissionDate').optional().isISO8601().withMessage('Invalid admission date format'),
  body('admissionReceiptNo').optional(),
  body('admissionReceiptLink')
    .optional()
    .customSanitizer(v => typeof v === 'string' ? v.replace(/`/g, '').trim() : v)
    .isURL().withMessage('Admission receipt link must be a valid URL'),
  body('schoolId').optional().isInt().withMessage('schoolId must be an integer'),
  body('schoolCode').optional().isLength({ min: 4, max: 4 }).withMessage('schoolCode must be 4 characters'),
  body()
    .custom((_, { req }) => {
      if (!req.body.schoolId && !req.body.schoolCode) {
        throw new Error('Either schoolId or schoolCode is required');
      }
      return true;
    }),
  validateRequest
];

export const studentProfileValidation = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  validateRequest
];

export const staffValidation = [
  body('name').notEmpty().withMessage('Staff name is required'),
  body('email').isEmail().withMessage('Must be a valid email'),
  body('role').notEmpty().withMessage('Staff role is required'),
  body('schoolId').isInt().withMessage('Valid school ID is required'),
  validateRequest
];

export const assignmentValidation = [
  body('title').notEmpty().withMessage('Assignment title is required'),
  body('className').notEmpty().withMessage('Class name is required'),
  body('fromDate').isISO8601().withMessage('Valid from date is required'),
  body('toDate').isISO8601().withMessage('Valid to date is required'),
  body('fileUrl').isURL().withMessage('Valid file URL is required'),
  body('schoolId').isInt().withMessage('Valid school ID is required'),
  body('classroomId').isInt().withMessage('Valid classroom ID is required'),
  body('description').optional(),
  validateRequest
];

export const timetableSlotValidation = [
  body('schoolId').optional().isInt().withMessage('schoolId must be an integer'),
  body('schoolCode').optional().isLength({ min: 4, max: 4 }).withMessage('schoolCode must be 4 characters'),
  body().custom((_, { req }) => {
    if (!req.body.schoolId && !req.body.schoolCode) {
      throw new Error('Either schoolId or schoolCode is required');
    }
    return true;
  }),
  body('classroomId').isInt().withMessage('Valid classroom ID is required'),
  body('day').isIn(['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']).withMessage('Invalid day'),
  body('slotType').isIn(['CLASS','BREAK']).withMessage('Invalid slot type'),
  body('startTime').matches(/^([01]?\d|2[0-3]):([0-5]\d)$/).withMessage('startTime must be HH:mm'),
  body('endTime').matches(/^([01]?\d|2[0-3]):([0-5]\d)$/).withMessage('endTime must be HH:mm'),
  body('academicYear').notEmpty().withMessage('Academic year is required'),
  body('subjectId').optional().isInt(),
  body('teacherId').optional().isInt(),
  body('notes').optional(),
  validateRequest
];
