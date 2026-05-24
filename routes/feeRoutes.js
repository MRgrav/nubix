// routes\feeRoutes.js
import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";

import * as feeCategoryCtrl from "../controllers/feeControllers/feeCategoryController.js";
import * as feeStructureCtrl from "../controllers/feeControllers/feeStructureController.js";
import * as studentFeeCtrl from "../controllers/feeControllers/studentFeeController.js";

import {
  createLateFeeConfig,
  getLateFeeConfig,
  applyLateFeeToStudent,
  createTransportRoute,
  getTransportRoutes,
  assignStudentTransport,
  optOutStudentTransport,
  createFeeAdjustment,
  getFeeAdjustments,
} from "../controllers/feeControllers/feeManagementController.js";

const router = express.Router();

router.use(authenticate);

// ^ Fee Categories
router.post(
  "/categories",
  authorize("ADMIN"),
  feeCategoryCtrl.createFeeCategory,
);

router.post(
  "/categories/bulk",
  authorize("ADMIN"),
  feeCategoryCtrl.createBulkFeeCategories,
);

router.get("/categories", authorize("ADMIN"), feeCategoryCtrl.getFeeCategories);
router.put(
  "/categories/:id",
  authorize("ADMIN"),
  feeCategoryCtrl.updateFeeCategory,
);
router.delete(
  "/categories/:id",
  authorize("ADMIN"),
  feeCategoryCtrl.deleteFeeCategory,
);

// ^ Fee Structures
router.post(
  "/structures",
  authorize("ADMIN"),
  feeStructureCtrl.createFeeStructure,
);
router.get(
  "/structures",
  authorize("ADMIN"),
  feeStructureCtrl.getFeeStructures,
);
router.get(
  "/structures/report",
  authorize("ADMIN"),
  feeStructureCtrl.getFeeStructureReport,
);

router.put(
  "/structures/:id",
  authorize("ADMIN"),
  feeStructureCtrl.updateFeeStructure,
);
router.put(
  "/structures/:id/lock",
  authorize("ADMIN"),
  feeStructureCtrl.lockFeeStructure,
);

// ^ Student Fees
router.post(
  "/student-fees",
  authorize("ADMIN"),
  studentFeeCtrl.assignStudentFee,
);
router.get(
  "/student-fees",
  authorize("ADMIN", "STAFF"),
  studentFeeCtrl.getStudentFee,
);
router.get(
  "/my-fees",
  authorize("STUDENT", "PARENT"),
  studentFeeCtrl.getMyFees,
);
router.get(
  "/dues",
  authorize("ADMIN", "STAFF"),
  studentFeeCtrl.getOutstandingDues,
);
router.post("/payments", authorize("ADMIN"), studentFeeCtrl.recordPayment);
router.post("/discounts", authorize("ADMIN"), studentFeeCtrl.applyDiscount);

// ! Late Fees
router.post("/late-fee-config", authorize("ADMIN"), createLateFeeConfig);
router.get("/late-fee-config", authorize("ADMIN", "STAFF"), getLateFeeConfig);
router.post("/late-fees", authorize("ADMIN"), applyLateFeeToStudent);

// ! Transport
router.post("/transport/routes", authorize("ADMIN"), createTransportRoute);
router.get(
  "/transport/routes",
  authorize("ADMIN", "STAFF"),
  getTransportRoutes,
);
router.post("/transport/assign", authorize("ADMIN"), assignStudentTransport);
router.post("/transport/opt-out", authorize("ADMIN"), optOutStudentTransport);

// ! Fee Adjustments / Refunds
router.post("/adjustments", authorize("ADMIN"), createFeeAdjustment);
router.get("/adjustments", authorize("ADMIN", "STAFF"), getFeeAdjustments);

export default router;
