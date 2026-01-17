import express from "express";
import {
  createAssignment,
  getAssignments,
  getAssignment,
  updateAssignment,
  deleteAssignment,
} from "../controllers/assignmentController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import { assignmentValidation } from "../middlewares/validationMiddleware.js";

const router = express.Router();
router.use(authenticate);

// Routes accessible to authenticated users (view assignments)
router.get("/", getAssignments);
router.get("/:id", getAssignment);

// Admin and Staff can create/update/delete assignments
router.post(
  "/",
  authorize("ADMIN", "STAFF"),
  assignmentValidation,
  createAssignment
);

router.put(
  "/:id",
  authorize("ADMIN", "STAFF"),
  assignmentValidation,
  updateAssignment
);

router.delete("/:id", authorize("ADMIN", "STAFF"), deleteAssignment);

export default router;
