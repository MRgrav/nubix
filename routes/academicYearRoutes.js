import express from "express";
import {
  createAcademicYear,
  getAcademicYears,
  getAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
} from "../controllers/academicYearController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, authorize("ADMIN"), getAcademicYears);
router.post("/", authenticate, authorize("ADMIN"), createAcademicYear);
router.get("/:id", authenticate, getAcademicYear);
router.put("/:id", authenticate, authorize("ADMIN"), updateAcademicYear);
router.delete("/:id", authenticate, authorize("ADMIN"), deleteAcademicYear);

export default router;
