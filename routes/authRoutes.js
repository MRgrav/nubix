import express from "express";
import {
  createUser,
  login,
  refreshToken,
  requestPasswordReset,
  resetPassword,
  setupAdmin,
  updateAdminProfile,
} from "../controllers/authController.js";
import { loginValidation } from "../middlewares/validationMiddleware.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public routes
router.post("/login", loginValidation, login);
router.post("/refresh-token", refreshToken);
router.post("/password-reset/request", requestPasswordReset);
router.post("/password-reset/confirm", resetPassword);

// One-time bootstrap route to create initial ADMIN. Requires BOOTSTRAP_ADMIN_SECRET env var.
router.post("/setup-admin", setupAdmin);
router.put(
  "/admin/profile",
  authenticate,
  authorize("ADMIN"),
  updateAdminProfile,
);

// Admin only routes
router.post("/users", authenticate, authorize("ADMIN"), createUser);

export default router;
