import express from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { timetableSlotValidation } from '../middlewares/validationMiddleware.js';
import { createSlot, getSlots, updateSlot, deleteSlot } from '../controllers/timetableController.js';

const router = express.Router();

router.get('/', authenticate, authorize('ADMIN', 'STAFF', 'STUDENT'), getSlots);
router.post('/slots', authenticate, authorize('ADMIN', 'STAFF'), timetableSlotValidation, createSlot);
router.put('/slots/:id', authenticate, authorize('ADMIN', 'STAFF'), timetableSlotValidation, updateSlot);
router.delete('/slots/:id', authenticate, authorize('ADMIN', 'STAFF'), deleteSlot);

export default router;

