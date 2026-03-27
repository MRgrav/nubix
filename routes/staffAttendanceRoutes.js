import express from "express";

import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  markStaffGeoAttendance,
  getAllStaffAttendances,
  getMyStaffAttendances,
} from "../controllers/staffAttendanceController.js";

const router = express.Router();

router.post("/geo", authenticate, authorize("STAFF"), markStaffGeoAttendance);

// Admin gets all staff attendances (with filters)
router.get("/", authenticate, authorize("ADMIN"), getAllStaffAttendances);

// Staff gets their own attendances (with filters)
router.get("/me", authenticate, authorize("STAFF"), getMyStaffAttendances);

export default router;
