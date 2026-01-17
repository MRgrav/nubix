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
} from "../controllers/ptmController.js";

import { enforceStudentAccess } from "../middlewares/studentAccessMiddleware.js";

const router = express.Router();
router.use(authenticate);

router.post("/request", enforceStudentAccess, requestPTM);
router.get("/me", enforceStudentAccess, getMyPTMs);

// Admin only
router.get("/", authorize("ADMIN"), getAllPTMs);
router.delete("/:id", authorize("ADMIN"), deletePTM);

router.get("/:id", enforceStudentAccess, getPTMById);

router.put("/:id/approve", enforceStudentAccess, approvePTM);
router.put("/:id/postpone", enforceStudentAccess, postponePTM);
router.put("/:id/reject", enforceStudentAccess, rejectPTM);

export default router;
