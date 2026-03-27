import express from "express";
import {
  createAnnouncement,
  getAnnouncements,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  suspendEvent,
  getMyAnnouncements,
  getUniversalAnnouncements,
} from "../controllers/announcementController.js";

import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import { announcementPermission } from "../middlewares/announcementPermission.js";
import { loadAnnouncement } from "../middlewares/loadAnnouncement.js";
import { uploadAnnouncementDoc } from "../middlewares/upload.js";
const router = express.Router();

router.use(authenticate);

router.get("/", getAnnouncements);
router.get(
  "/my-announcements",
  authorize("STUDENT", "PARENT"),
  getMyAnnouncements,
);
router.get(
  "/announcements/universal",
  authorize("STUDENT", "PARENT"),
  getUniversalAnnouncements,
);
router.get("/:id", loadAnnouncement, getAnnouncement);

router.post(
  "/",
  uploadAnnouncementDoc,
  announcementPermission,
  createAnnouncement,
);
router.put(
  "/:id",
  loadAnnouncement,
  uploadAnnouncementDoc,
  announcementPermission,
  updateAnnouncement,
);
router.delete(
  "/:id",
  loadAnnouncement,
  announcementPermission,
  deleteAnnouncement,
);

router.patch(
  "/:id/suspend",
  loadAnnouncement,
  announcementPermission,
  suspendEvent,
);

export default router;
