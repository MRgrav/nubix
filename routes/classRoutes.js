import express from "express";
import {
  createClassroom,
  getClassrooms,
  getClassroom,
  updateClassroom,
  deleteClassroom,
  addStudentToClass,
  removeStudentFromClass,
  getClassTeachers,
  getClassSubjects,
  getStudentsInClass,
} from "../controllers/classController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
const router = express.Router();
router.use(authenticate);

router.get("/", authorize("ADMIN", "STAFF"), getClassrooms);
router.post("/", authorize("ADMIN", "STAFF"), createClassroom);
router.get("/:id", authorize("ADMIN", "STAFF"), getClassroom);
router.put("/:id", authorize("ADMIN", "STAFF"), updateClassroom);
router.delete("/:id", deleteClassroom);

router.get(
  "/:classId/students",
  authorize("ADMIN", "STAFF"),
  getStudentsInClass,
);

router.post(
  "/:classId/students",
  authorize("ADMIN", "STAFF"),
  addStudentToClass,
);
router.delete(
  "/:classId/students",
  authorize("ADMIN", "STAFF"),
  removeStudentFromClass,
);

router.get(
  "/:id/teachers",
  authorize("ADMIN", "STAFF", "STUDENT"),
  getClassTeachers,
);
router.get(
  "/:id/subjects",
  authorize("ADMIN", "STAFF", "STUDENT"),
  getClassSubjects,
);

export default router;
