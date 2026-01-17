import express from 'express';
import { enrollStudentInStream, getStudentStreams, getStudentStream, updateStudentStream, unenrollStudent } from '../controllers/studentStreamController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/enroll', authenticate, authorize('ADMIN', 'STAFF'), enrollStudentInStream);
router.get('/', authenticate, getStudentStreams);
router.get('/:id', authenticate, getStudentStream);
router.put('/:id', authenticate, authorize('ADMIN'), updateStudentStream);
router.delete('/:id', authenticate, authorize('ADMIN'), unenrollStudent);

export default router;