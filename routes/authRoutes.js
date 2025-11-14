import express from 'express';
import { 
  createUser, 
  login, 
  refreshToken, 
  changePassword,
  forgotPassword,
  resetPassword,
  setupAdmin
} from '../controllers/authController.js';
import { loginValidation } from '../middlewares/validationMiddleware.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/login', loginValidation, login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// Protected routes
router.post('/change-password', authenticate, changePassword);

// One-time bootstrap route to create initial ADMIN. Requires BOOTSTRAP_ADMIN_SECRET env var.
router.post('/setup-admin', setupAdmin);

// Admin only routes
router.post('/users', authenticate, authorize('ADMIN'), createUser);

export default router;
