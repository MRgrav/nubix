import express from 'express';
import {
  createAssignment,
  getAssignments,
  getAssignment,
  updateAssignment,
  deleteAssignment
} from '../controllers/assignmentController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { assignmentValidation } from '../middlewares/validationMiddleware.js';

const router = express.Router();

// Routes accessible to authenticated users (view assignments)
router.get('/', authenticate, getAssignments);
router.get('/:id', authenticate, getAssignment);

// Admin and Staff can create/update/delete assignments
router.post(
  '/', 
  authenticate, 
  authorize('ADMIN', 'STAFF'), 
  assignmentValidation, 
  createAssignment
);

router.put(
  '/:id', 
  authenticate, 
  authorize('ADMIN', 'STAFF'), 
  assignmentValidation, 
  updateAssignment
);

router.delete(
  '/:id', 
  authenticate, 
  authorize('ADMIN', 'STAFF'), 
  deleteAssignment
);

export default router;

