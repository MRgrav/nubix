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
  body('schoolId').isInt().withMessage('Valid school ID is required'),
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