import express from "express";
import {
  enrollStudentInStream,
  getStudentStreams,
  getStudentStream,
  updateStudentStream,
  unenrollStudent,
  getMyEnrollment,
} from "../controllers/studentStreamController.js";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post(
  "/enroll",
  authenticate,
  authorize("ADMIN", "STAFF"),
  enrollStudentInStream,
);
router.get("/", authenticate, authorize("ADMIN", "STAFF"), getStudentStreams);
router.get("/my-enrollment", authenticate, getMyEnrollment);

router.get("/:id", authenticate, authorize("ADMIN", "STAFF"), getStudentStream);
router.put("/:id", authenticate, authorize("ADMIN"), updateStudentStream);
router.delete("/:id", authenticate, authorize("ADMIN"), unenrollStudent);

export default router;
