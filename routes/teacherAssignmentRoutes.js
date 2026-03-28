// routes/teacherAssignmentRoutes.js
import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createTeacherAssignment,
  getTeacherAssignments,
  getTeacherAssignment,
  updateTeacherAssignment,
  deleteTeacherAssignment,
  getMyTeacherAssignments,
} from "../controllers/teacherAssignmentController.js";

const router = express.Router();

router.post("/", authenticate, authorize("ADMIN"), createTeacherAssignment);
router.get("/", authenticate, getTeacherAssignments);
router.get(
  "/my-assignments",
  authenticate,
  authorize("STAFF"),
  getMyTeacherAssignments,
);
router.get("/:id", authenticate, getTeacherAssignment);
router.put("/:id", authenticate, authorize("ADMIN"), updateTeacherAssignment);
router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  deleteTeacherAssignment,
);

export default router;
