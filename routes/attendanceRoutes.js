import express from 'express';
import {
  markStudentAttendance,
  getStudentAttendance,
  updateStudentAttendance,
  markStaffAttendance,
  getStaffAttendance,
  deleteAttendance
} from '../controllers/attendanceController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
const router = express.Router();

// Student attendance
router.post('/students',authenticate, authorize('ADMIN', 'STAFF'), markStudentAttendance);
router.get('/students',authenticate, authorize('ADMIN', 'STAFF'), getStudentAttendance);
router.put('/students/:id',authenticate, authorize('ADMIN', 'STAFF'), updateStudentAttendance);

// Staff attendance
router.post('/staff',authenticate, authorize('ADMIN', 'STAFF'), markStaffAttendance);
router.get('/staff',authenticate, authorize('ADMIN', 'STAFF'), getStaffAttendance);
router.put('/staff/:id',authenticate, authorize('ADMIN', 'STAFF'), updateStudentAttendance); // reuse update method

// Delete attendance (generic)
router.delete('/:id',authenticate, authorize('ADMIN', 'STAFF'), deleteAttendance);

export default router;
