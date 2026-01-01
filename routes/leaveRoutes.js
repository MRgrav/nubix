import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import {
  createLeaveRequest,
  getMyLeaveRequests,
  getLeaveRequestById,
  approveLeaveRequest,
  rejectLeaveRequest,
  getAllLeaveRequests
} from '../controllers/leaveController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Step 1: Submit Leave Request (Staff/Admin)
router.post('/', createLeaveRequest);

// Step 2: View Own Leave Requests (must come before /:id)
router.get('/me', getMyLeaveRequests);

// Step 5: Fetch All Leaves (Admin) - must come before /:id
router.get('/', getAllLeaveRequests);

// Step 3: View Single Leave Request
router.get('/:id', getLeaveRequestById);

// Step 4: Admin Approve/Reject Leave Request
router.put('/:id/approve', approveLeaveRequest);
router.put('/:id/reject', rejectLeaveRequest);

export default router;

