import express from 'express';
import {
  createStudent,
  getStudents,
  getStudent,
  updateStudent,
  updateStudentProfile,
  deleteStudent
} from '../controllers/studentController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { studentValidation, studentProfileValidation } from '../middlewares/validationMiddleware.js';

const router = express.Router();

// List and search routes
router.get('/', authenticate,authorize('ADMIN', 'STAFF'), getStudents);

// Profile route (must come before generic :id routes)
router.put('/profile/:id', authenticate, studentProfileValidation, updateStudentProfile);

// Specific ID routes
router.get('/:id', authenticate, getStudent);
router.put('/:id', authenticate, authorize('ADMIN', 'STAFF'), studentValidation, updateStudent);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteStudent);

// Create route
router.post('/', authenticate, authorize('ADMIN', 'STAFF'), studentValidation, createStudent);

export default router;
