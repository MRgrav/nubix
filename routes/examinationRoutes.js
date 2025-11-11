import express from 'express';
import {
  createExamination,
  getExaminations,
  getExamination,
  updateExamination,
  deleteExamination,
  addExaminationResult,
  getStudentExaminationResults,
  getExaminationResult,
  deleteExaminationResult,
  getExaminationStats
} from '../controllers/examinationController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Examination management routes
router.get('/', authenticate, authorize('ADMIN', 'STAFF'), getExaminations);
router.post('/', authenticate, authorize('ADMIN', 'STAFF'), createExamination);
router.get('/:id', authenticate, authorize('ADMIN', 'STAFF', 'STUDENT'), getExamination);
router.put('/:id', authenticate, authorize('ADMIN', 'STAFF'), updateExamination);
router.delete('/:id', authenticate, authorize('ADMIN', 'STAFF'), deleteExamination);

// Examination results routes
router.post('/results/add', authenticate, authorize('ADMIN', 'STAFF'), addExaminationResult);
router.get('/student/:studentId', authenticate, authorize('ADMIN', 'STAFF', 'STUDENT'), getStudentExaminationResults);
router.get('/result/:resultId', authenticate, authorize('ADMIN', 'STAFF', 'STUDENT'), getExaminationResult);
router.delete('/result/:resultId', authenticate, authorize('ADMIN', 'STAFF'), deleteExaminationResult);

// Statistics route
router.get('/:examinationId/stats', authenticate, authorize('ADMIN', 'STAFF'), getExaminationStats);

export default router;
