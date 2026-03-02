import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createBoard,
  getBoards,
  getBoard,
  updateBoard,
  deleteBoard,
} from "../controllers/examinationController/examBoardController.js";

const router = express.Router();
router.use(authenticate);

router.post("/", authorize("ADMIN"), createBoard);
router.get("/", getBoards); // All authenticated users can list
router.get("/:id", getBoard);
router.put("/:id", authorize("ADMIN"), updateBoard);
router.delete("/:id", authorize("ADMIN"), deleteBoard);

export default router;
