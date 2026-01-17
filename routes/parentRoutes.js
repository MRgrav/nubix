import express from "express";

import {
  createParent,
  getParents,
  getMyChildren,
  selectChild,
  updateParent,
  deleteParent,
} from "../controllers/parentController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.use(authenticate);

// Admin only
router.post("/", authorize("ADMIN"), createParent);
router.get("/", authorize("ADMIN"), getParents);

// Admin only
router.put("/:id", authorize("ADMIN"), updateParent);
router.delete("/:id", authorize("ADMIN"), deleteParent);

// Parents only
router.get("/my-children", authorize("PARENT"), getMyChildren);
router.post("/select-child", authorize("PARENT"), selectChild);

export default router;
