import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import {
  requestPTM,
  getMyPTMs,
  getPTMById,
  approvePTM,
  postponePTM,
  rejectPTM,
  getAllPTMs,
} from "../controllers/ptmController.js";

const router = express.Router();
router.use(authenticate);

router.post("/request", requestPTM);
router.get("/me", getMyPTMs);
router.get("/", getAllPTMs); // admin/principal only
router.get("/:id", getPTMById);

router.put("/:id/approve", approvePTM);
router.put("/:id/postpone", postponePTM);
router.put("/:id/reject", rejectPTM);

export default router;
