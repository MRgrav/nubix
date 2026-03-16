// routes\admissionRoutes.js
import express from "express";
import {
  createAdmission,
  getAdmissions,
  getAdmission,
  updateAdmission,
  approveAdmission,
  rejectAdmission,
} from "../controllers/admissionController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import { uploadAdmissionDocs } from "../middlewares/upload.js";

const router = express.Router();

router.post("/public/", uploadAdmissionDocs, createAdmission);
router.get("/", authenticate, authorize("ADMIN"), getAdmissions);
router.get("/:id", authenticate, authorize("ADMIN"), getAdmission);
router.put("/:id", authenticate, authorize("ADMIN"), updateAdmission);
router.post("/:id/approve", authenticate, authorize("ADMIN"), approveAdmission);
router.post("/:id/reject", authenticate, authorize("ADMIN"), rejectAdmission);

export default router;
