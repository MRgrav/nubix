import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  timetableSlotCreateValidation,
  timetableSlotUpdateValidation,
} from "../middlewares/validationMiddleware.js";
import {
  createSlot,
  getSlots,
  updateSlot,
  deleteSlot,
  getMyStudentTimetable,
  getMyTeacherSlots,
} from "../controllers/timetableController.js";

const router = express.Router();

router.get("/", authenticate, authorize("ADMIN", "STAFF"), getSlots);
router.post(
  "/slots",
  authenticate,
  authorize("ADMIN", "STAFF"),
  timetableSlotCreateValidation,
  createSlot,
);
router.get(
  "/student",
  // authorize("STUDENT", "PARENT"),
  authenticate,
  getMyStudentTimetable,
);
router.get(
  "/teacher",
  // authorize("STAFF"),
  authenticate,
  getMyTeacherSlots,
);

router.put(
  "/slots/:id",
  authenticate,
  authorize("ADMIN", "STAFF"),
  timetableSlotUpdateValidation,
  updateSlot,
);
router.delete(
  "/slots/:id",
  authenticate,
  authorize("ADMIN", "STAFF"),
  deleteSlot,
);

export default router;
