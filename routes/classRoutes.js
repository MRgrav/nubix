import express from 'express';
import {
  createClassroom,
  getClassrooms,
  getClassroom,
  updateClassroom,
  deleteClassroom,
  addStudentToClass,
  removeStudentFromClass
} from '../controllers/classController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
const router = express.Router();

router.get('/',authenticate,authorize('ADMIN', 'STAFF'), getClassrooms);
router.post('/', authenticate,authorize('ADMIN', 'STAFF'),createClassroom);
router.get('/:id',authenticate,authorize('ADMIN', 'STAFF'), getClassroom);
router.put('/:id', authenticate,authorize('ADMIN', 'STAFF'),updateClassroom);
router.delete('/:id', deleteClassroom);

router.post('/:classId/students',authenticate,authorize('ADMIN', 'STAFF'), addStudentToClass);
router.delete('/:classId/students', authenticate,authorize('ADMIN', 'STAFF'),removeStudentFromClass);

export default router;
