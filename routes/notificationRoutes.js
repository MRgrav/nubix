// routes\notificationRoutes.js
import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  registerFcmToken
} from "../controllers/notificationController.js";

const router = express.Router();

router.post("/register-token", authenticate, registerFcmToken);
router.get("/", authenticate, getMyNotifications);
router.patch("/:id/read", authenticate, markAsRead);
router.patch("/read-all", authenticate, markAllAsRead);

export default router;
