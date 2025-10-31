import express from 'express';
import {
  createStaff,
  getStaff,
  getStaffMember,
  updateStaffMember,
  deleteStaffMember
} from '../controllers/staffController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { staffValidation } from '../middlewares/validationMiddleware.js';

const router = express.Router();

// Routes accessible to authenticated users
router.get('/', authenticate, getStaff);
router.get('/:id', authenticate, getStaffMember);

// Admin-only routes
router.post('/', authenticate, authorize('ADMIN'), staffValidation, createStaff);
router.put('/:id', authenticate, authorize('ADMIN'), staffValidation, updateStaffMember);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteStaffMember);

export default router;
