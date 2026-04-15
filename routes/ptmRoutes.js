import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  requestPTM,
  getMyPTMs,
  getPTMById,
  approvePTM,
  postponePTM,
  rejectPTM,
  getAllPTMs,
  deletePTM,
  searchStudentsForPTM,
  searchTeachersForPTM,
  bulkRequestPTM,
} from "../controllers/ptmController.js";

import { enforceStudentAccess } from "../middlewares/studentAccessMiddleware.js";

const router = express.Router();
router.use(authenticate);

router.post("/request", enforceStudentAccess, requestPTM);
router.post("/request/bulk", authorize("ADMIN", "STAFF"), bulkRequestPTM);
router.get("/me", enforceStudentAccess, getMyPTMs);

// Admin only
router.get("/", authorize("ADMIN"), getAllPTMs);
router.delete("/:id", authorize("ADMIN"), deletePTM);

router.get("/:id", enforceStudentAccess, getPTMById);

router.put("/:id/approve", enforceStudentAccess, approvePTM);
router.put("/:id/postpone", enforceStudentAccess, postponePTM);
router.put("/:id/reject", enforceStudentAccess, rejectPTM);

// 1. Teachers search students to request PTM
router.get(
  "/students/search",
  authorize("TEACHER", "STAFF", "ADMIN"),
  searchStudentsForPTM,
);

// 2. Students/Parents search teachers to request PTM
router.get(
  "/teachers/search",
  authorize("STUDENT", "PARENT"),
  searchTeachersForPTM,
);
export default router;
