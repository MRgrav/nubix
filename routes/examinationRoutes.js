import express from "express";

import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createExamConfig,
  getExamConfigs,
  createGradingScheme,
  getGradingSchemes,
  getGradingSchemeById,
  updateExamConfig,
  deleteExamConfig,
} from "../controllers/examinationController/examConfigController.js";

import {
  createExamTerm,
  getExamTerms,
  lockTermResults,
  publishTermResults,
  updateExamTerm,
  deleteExamTerm,
} from "../controllers/examinationController/examTermController.js";
import {
  createExam,
  getExams,
  updateExam,
} from "../controllers/examinationController/examController.js";
import {
  enterExamMarks,
  getExamMarks,
} from "../controllers/examinationController/examMarksController.js";
import {
  getExamResults,
  calculateTermResults,
} from "../controllers/examinationController/examResultController.js";
import { sendError, sendSuccess } from "../utils/responseStructure.js";

const router = express.Router();
router.use(authenticate);

// ────────────────────────────────────────────────
// Exam Configs & Grading (Admin only)
// ────────────────────────────────────────────────
router.post("/configs", authorize("ADMIN"), createExamConfig);
router.get("/configs", authorize("ADMIN", "STAFF"), getExamConfigs);
router.put("/configs/:id", authorize("ADMIN"), updateExamConfig);
router.delete("/configs/:id", authorize("ADMIN"), deleteExamConfig);
router.get("/grading-schemes", authorize("ADMIN"), getGradingSchemes);
router.get("/grading-schemes/:id", authorize("ADMIN"), getGradingSchemeById);
router.post("/grading-schemes", authorize("ADMIN"), createGradingScheme);

// ────────────────────────────────────────────────
// Exam Terms (Admin)
// ────────────────────────────────────────────────
router.post("/terms", authorize("ADMIN"), createExamTerm);
router.post("/terms/lock", authorize("ADMIN"), lockTermResults);
router.post("/terms/publish", authorize("ADMIN"), publishTermResults);
router.get("/terms", authorize("ADMIN", "STAFF"), getExamTerms);
router.put("/terms/:id", authorize("ADMIN", "STAFF"), updateExamTerm);
router.delete("/terms/:id", authorize("ADMIN", "STAFF"), deleteExamTerm);
router.post("/terms/results/lock", authorize("ADMIN"), lockTermResults);
router.post("/terms/results/publish", authorize("ADMIN"), publishTermResults);

// ────────────────────────────────────────────────
// Exams (Admin/Teacher)
// ────────────────────────────────────────────────
router.post("/", authorize("ADMIN", "STAFF"), createExam);
router.get("/", authorize("ADMIN", "STAFF", "STUDENT", "PARENT"), getExams);
router.put("/:id", authorize("ADMIN", "STAFF"), updateExam);

// ────────────────────────────────────────────────
// Marks Entry (Teacher)
// ────────────────────────────────────────────────
router.get(
  "/:examId/marks",
  authorize("ADMIN", "STAFF", "STUDENT", "PARENT"),
  getExamMarks,
);
router.post("/:examId/marks", authorize("STAFF", "ADMIN"), enterExamMarks);

// ────────────────────────────────────────────────
// Results (All roles)
// ────────────────────────────────────────────────
router.get(
  "/results",
  authorize("ADMIN", "STAFF", "STUDENT", "PARENT"),
  getExamResults,
);
// routes/examinationRoutes.js
router.post(
  "/results/calculate",
  authorize("ADMIN", "STAFF"),
  calculateTermResults,
);

// Permission management routes
router.post('/permissions/update', authenticate, authorize('ADMIN'), updateExaminationPermission);
router.get('/:examinationId/permissions', authenticate, authorize('ADMIN'), getExaminationPermissions);

export default router;
