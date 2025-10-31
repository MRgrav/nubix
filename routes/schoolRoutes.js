import express from 'express';
import { 
  createSchool, 
  getSchools, 
  getSchool,
  updateSchool, 
  deleteSchool 
} from '../controllers/schoolController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { schoolValidation } from '../middlewares/validationMiddleware.js';

const router = express.Router();

// Public routes (still requires authentication)
router.get('/', authenticate, getSchools);
router.get('/:id', authenticate, getSchool);

// Protected routes (admin only)
router.post('/', authenticate, authorize('ADMIN'), schoolValidation, createSchool);
router.put('/:id', authenticate, authorize('ADMIN'), schoolValidation, updateSchool);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteSchool);

export default router;
