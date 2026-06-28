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
  getMyUpdateRequests,
  getAllAlumniWithRecords,
  getMyFullRecords,
} from "../controllers/alumniController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import jwt from "jsonwebtoken";
import { sendError } from "../utils/responseStructure.js";

const router = express.Router();

// In alumniRoutes.js or create a dedicated alumni auth middleware
const authenticateAlumni = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "No token provided");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "ALUMNI") {
      return sendError(res, 403, "Access denied. Alumni login required");
    }

    // Standardize req.user
    req.user = {
      id: decoded.id || decoded.alumniId,
      alumniId: decoded.alumniId || decoded.id,
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (err) {
    console.error("Alumni token error:", err.message);
    return sendError(res, 401, "Invalid or expired token");
  }
};

// Public
router.post("/submit", submitAlumni);
router.post("/login", alumniLogin);

// Alumni protected

router.get("/me/full", authenticateAlumni, getMyFullRecords);
router.post("/me/update", authenticateAlumni, submitAlumniUpdate);
router.get("/me/updates", authenticateAlumni, getMyUpdateRequests);
// ─── Admin Routes ───────────────────────────────────────────────────────
router.get(
  "/admin/all",
  authenticate,
  authorize("ADMIN", "STAFF"),
  getAllAlumniWithRecords,
);

router.get("/:id", authenticate, authorize("ADMIN"), getAlumniProfile);
router.get("/", authenticate, authorize("ADMIN"), getAlumniDirectory);
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
