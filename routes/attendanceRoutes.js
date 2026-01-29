import express from 'express';
import {
  markStudentAttendance,
  markBulkStudentAttendance,
  getStudentAttendance,
  updateStudentAttendance,
  markStaffAttendance,
  getStaffAttendance,
  deleteAttendance,
  getStudentAttendanceStats,
  getStaffAttendanceStats,
  getOverallStudentAttendanceStats
} from '../controllers/attendanceController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
const router = express.Router();

// Student attendance
router.get('/students/stats/overall', authenticate, authorize('ADMIN', 'STAFF'), getOverallStudentAttendanceStats);
router.get('/students/stats/:studentId', authenticate, authorize('ADMIN', 'STAFF'), getStudentAttendanceStats);
router.post('/students', authenticate, authorize('ADMIN', 'STAFF'), markStudentAttendance);
router.post('/students/bulk', authenticate, authorize('ADMIN', 'STAFF'), markBulkStudentAttendance);
router.get('/students', authenticate, authorize('ADMIN', 'STAFF'), getStudentAttendance);
router.put('/students/:id', authenticate, authorize('ADMIN', 'STAFF'), updateStudentAttendance);

// Staff attendance
router.get('/staff/stats/:staffId', authenticate, authorize('ADMIN', 'STAFF'), getStaffAttendanceStats);
router.post('/staff',authenticate, authorize('ADMIN', 'STAFF'), markStaffAttendance);
router.get('/staff',authenticate, authorize('ADMIN', 'STAFF'), getStaffAttendance);
router.put('/staff/:id',authenticate, authorize('ADMIN', 'STAFF'), updateStudentAttendance); // reuse update method

// Delete attendance (generic)
router.delete('/:id',authenticate, authorize('ADMIN', 'STAFF'), deleteAttendance);

export default router;
