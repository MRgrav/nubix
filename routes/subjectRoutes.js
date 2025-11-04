import express from 'express';
import {
  createSubject,
  getSubjects,
  getSubject,
  updateSubject,
  deleteSubject
} from '../controllers/subjectController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
const router = express.Router();

router.get('/',authenticate,authorize('ADMIN', 'STAFF'), getSubjects);
router.post('/',authenticate,authorize('ADMIN', 'STAFF'), createSubject);
router.get('/:id',authenticate,authorize('ADMIN', 'STAFF'), getSubject);
router.put('/:id',authenticate,authorize('ADMIN', 'STAFF'), updateSubject);
router.delete('/:id',authenticate,authorize('ADMIN', 'STAFF'), deleteSubject);

export default router;
