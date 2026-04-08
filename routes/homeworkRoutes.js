// routes/homeworkRoutes.js
import express from "express";
import {
  createHomework,
  getHomeworks,
  getHomework,
  deleteHomework,
} from "../controllers/homeworkController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import { uploadHomeworkDoc } from "../middlewares/upload.js";

const router = express.Router();

// POST   /api/homework        – Create homework (ADMIN / STAFF)
router.post("/", authenticate, authorize("ADMIN", "STAFF"), uploadHomeworkDoc, createHomework);

// GET    /api/homework        – List all homeworks
router.get("/", authenticate, getHomeworks);

// GET    /api/homework/:id    – Get single homework
router.get("/:id", authenticate, getHomework);

// DELETE /api/homework/:id    – Delete homework (ADMIN / STAFF)
router.delete("/:id", authenticate, authorize("ADMIN", "STAFF"), deleteHomework);

export default router;
