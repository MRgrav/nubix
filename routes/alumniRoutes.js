// routes\alumniRoutes.js
import express from "express";
import {
  submitAlumni,
  getAlumniDirectory,
  getAlumniProfile,
  getPendingSubmissions,
  getSubmissionDetails,
  verifySubmission,
  rejectSubmission,
  deleteSubmission,
  approveAlumniUpdate,
  alumniLogin,
  submitAlumniUpdate,
  getMyAlumniProfile,
  getMyUpdateRequests,
} from "../controllers/alumniController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import jwt from "jsonwebtoken";
import { sendError } from "../utils/responseStructure.js";

const router = express.Router();

const authenticateAlumni = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return sendError(res, 401, "No token provided");
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "ALUMNI") return sendError(res, 403, "Access denied");
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    return sendError(res, 401, "Invalid token");
  }
};

// Public
router.post("/login", alumniLogin);

// Alumni protected
router.get("/me", authenticateAlumni, getMyAlumniProfile);
router.post("/me/update", authenticateAlumni, submitAlumniUpdate);
router.get("/me/updates", authenticateAlumni, getMyUpdateRequests);

// ─── Public Routes (No Authentication Required) ─────────────────────────
router.post("/submit", submitAlumni);
router.get("/", getAlumniDirectory);
router.get("/:id", getAlumniProfile);

// ─── Admin Routes ───────────────────────────────────────────────────────
router.get(
  "/admin/submissions",
  authenticate,
  authorize("ADMIN", "STAFF"),
  getPendingSubmissions,
);
router.get(
  "/admin/submissions/:id",
  authenticate,
  authorize("ADMIN", "STAFF"),
  getSubmissionDetails,
);
router.put(
  "/admin/submissions/:id/verify",
  authenticate,
  authorize("ADMIN", "STAFF"),
  verifySubmission,
);
router.put(
  "/admin/submissions/:id/reject",
  authenticate,
  authorize("ADMIN", "STAFF"),
  rejectSubmission,
);
router.delete(
  "/admin/submissions/:id",
  authenticate,
  authorize("ADMIN", "STAFF"),
  deleteSubmission,
);
router.put(
  "/admin/updates/:id/approve",
  authenticate,
  authorize("ADMIN", "STAFF"),
  approveAlumniUpdate,
);

export default router;
