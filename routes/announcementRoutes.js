import express from "express";
import {
  createAnnouncement,
  getAnnouncements,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  suspendEvent,
} from "../controllers/announcementController.js";

import { authenticate } from "../middlewares/authMiddleware.js";
import { announcementPermission } from "../middlewares/announcementPermission.js";
import { loadAnnouncement } from "../middlewares/loadAnnouncement.js";

const router = express.Router();

router.use(authenticate);

router.get("/", getAnnouncements);
router.get("/:id", loadAnnouncement, getAnnouncement);

router.post("/", announcementPermission, createAnnouncement);
router.put(
  "/:id",
  loadAnnouncement,
  announcementPermission,
  updateAnnouncement
);
router.delete(
  "/:id",
  loadAnnouncement,
  announcementPermission,
  deleteAnnouncement
);

router.patch(
  "/:id/suspend",
  loadAnnouncement,
  announcementPermission,
  suspendEvent
);

export default router;
