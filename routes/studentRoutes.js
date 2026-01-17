import express from "express";
import {
  createStudent,
  getStudents,
  getStudent,
  updateStudent,
  updateStudentProfile,
  deleteStudent,
  getTeachersForStudent,
} from "../controllers/studentController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  studentValidation,
  studentProfileValidation,
} from "../middlewares/validationMiddleware.js";
import { enforceStudentAccess } from "../middlewares/studentAccessMiddleware.js";

const router = express.Router();

router.use(authenticate);

// Create route
router.post("/", authorize("ADMIN", "STAFF"), studentValidation, createStudent);

// List and search routes
router.get("/", authorize("ADMIN", "STAFF"), getStudents);

// Get single student by ID (enforced for parents)
router.get("/:id", enforceStudentAccess, getStudent);

// Update student by ID (ADMIN/STAFF only)
router.put(
  "/:id",
  authorize("ADMIN", "STAFF"),
  studentValidation,
  enforceStudentAccess,
  updateStudent,
);

// Profile route (must come before generic :id routes)
router.put(
  "/profile/:id",
  authenticate,
  studentProfileValidation,
  enforceStudentAccess,
  updateStudentProfile,
);

// // Specific ID routes
// router.get("/student", authenticate, getStudent);

router.delete("/:id", authenticate, authorize("ADMIN"), deleteStudent);

router.get("/:studentId/teachers", authenticate, getTeachersForStudent);

export default router;
