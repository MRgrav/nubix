import express from "express";
import {
  createStream,
  getStreams,
  getStream,
  updateStream,
  deleteStream,
  getOnlyStreams,
} from "../controllers/streamController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, getStreams);
router.post("/", authenticate, authorize("ADMIN"), createStream);
router.get("/details", authenticate, getOnlyStreams);
router.get("/:id", authenticate, getStream);
router.put("/:id", authenticate, authorize("ADMIN"), updateStream);
router.delete("/:id", authenticate, authorize("ADMIN"), deleteStream);

export default router;
