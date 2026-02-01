import express from "express";
import {
  createStaff,
  getStaffs,
  getStaffMember,
  updateStaffMember,
  deleteStaffMember,
  getMinimalTeachers,
} from "../controllers/staffController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import { staffValidation } from "../middlewares/validationMiddleware.js";

const router = express.Router();

// Routes accessible to authenticated users
router.get("/", authenticate, getStaffs);
router.get("/:id", authenticate, getStaffMember);
router.get("/min/details", authenticate, getMinimalTeachers);

// Admin-only routes
router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  staffValidation,
  createStaff,
);
router.put(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  staffValidation,
  updateStaffMember,
);
router.delete("/:id", authenticate, authorize("ADMIN"), deleteStaffMember);

export default router;
