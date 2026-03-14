import express from "express";
import {
  createCurriculumSubject,
  getCurriculumSubjects,
  updateCurriculumSubject,
  deleteCurriculumSubject,
  getSubjectsForClass,
} from "../controllers/curriculumSubjectController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Admin & Staff can manage curriculum
router.post("/", authorize("ADMIN", "STAFF"), createCurriculumSubject);
router.get("/", authorize("ADMIN", "STAFF", "STUDENT"), getCurriculumSubjects);
router.get(
  "/class",
  authorize("ADMIN", "STAFF", "STUDENT"),
  getSubjectsForClass,
); // Useful endpoint
router.put("/:id", authorize("ADMIN", "STAFF"), updateCurriculumSubject);
router.delete("/:id", authorize("ADMIN", "STAFF"), deleteCurriculumSubject);

export default router;
