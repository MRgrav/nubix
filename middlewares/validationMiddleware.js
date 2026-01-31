import { body, validationResult } from "express-validator";

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    });
  }
  next();
};

export const createUserValidation = [
  body("email").isEmail().withMessage("Must be a valid email"),
  body("name").notEmpty().withMessage("Name is required"),
  body("role")
    .isIn(["STUDENT", "STAFF"])
    .withMessage("Role must be either STUDENT or STAFF"),
  body("schoolId").isInt().withMessage("Valid school ID is required"),
  body("staffRole")
    .optional()
    .isIn(["TEACHER", "PRINCIPAL", "COUNSELOR", "ADMINISTRATOR"])
    .withMessage("Invalid staff role"),
  validateRequest,
];

export const loginValidation = [
  body("email").isEmail().withMessage("Must be a valid email"),
  body("password").exists().withMessage("Password is required"),
  validateRequest,
];

export const schoolValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("School name is required")
    .isLength({ min: 3, max: 100 })
    .withMessage("School name must be between 3 and 100 characters"),

  body("schoolCode")
    .trim()
    .notEmpty()
    .withMessage("School code is required")
    .isLength({ min: 5, max: 5 })
    .withMessage("School code must be exactly 5 characters")
    .matches(/^\d{5}$/)
    .withMessage("School code must be exactly 5 digits (00000-99999)"),

  body("address").optional().trim(),

  validateRequest,
];

export const studentValidation = [
  body("name").notEmpty().withMessage("Student name is required"),
  body("email").isEmail().withMessage("Must be a valid email"),
  body("grade").optional(),
  body("dateOfBirth").optional().isISO8601().withMessage("Invalid date format"),
  body("gender").optional(),
  body("previousSchoolName").optional(),
  body("previousClass").optional(),
  body("previousGrade").optional(),
  body("promotedToClass").optional(),
  body("totalAdmissionAmount")
    .optional()
    .isFloat()
    .withMessage("Total admission amount must be a number"),
  body("monthlyFees")
    .optional()
    .isFloat()
    .withMessage("Monthly fees must be a number"),
  body("admissionDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid admission date format"),
  body("admissionReceiptNo").optional(),
  body("admissionReceiptLink")
    .optional()
    .customSanitizer((v) =>
      typeof v === "string" ? v.replace(/`/g, "").trim() : v,
    )
    .isURL()
    .withMessage("Admission receipt link must be a valid URL"),
  body("schoolId")
    .optional()
    .isInt()
    .withMessage("schoolId must be an integer"),
  body("schoolCode")
    .optional()
    .isLength({ min: 4, max: 4 })
    .withMessage("schoolCode must be 4 characters"),
  body().custom((_, { req }) => {
    if (!req.body.schoolId && !req.body.schoolCode) {
      throw new Error("Either schoolId or schoolCode is required");
    }
    return true;
  }),
  validateRequest,
];

export const studentProfileValidation = [
  body("name")
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("dateOfBirth").optional().isISO8601().withMessage("Invalid date format"),
  validateRequest,
];

export const staffValidation = [
  body("name").notEmpty().withMessage("Staff name is required"),
  body("email").isEmail().withMessage("Must be a valid email"),
  body("role").notEmpty().withMessage("Staff role is required"),
  body("schoolId").isInt().withMessage("Valid school ID is required"),
  validateRequest,
];

export const assignmentValidation = [
  body("title").notEmpty().withMessage("Assignment title is required"),
  body("className").notEmpty().withMessage("Class name is required"),
  body("fromDate").isISO8601().withMessage("Valid from date is required"),
  body("toDate").isISO8601().withMessage("Valid to date is required"),
  body("fileUrl").isURL().withMessage("Valid file URL is required"),
  body("schoolId").isInt().withMessage("Valid school ID is required"),
  body("classroomId").isInt().withMessage("Valid classroom ID is required"),
  body("description").optional(),
  validateRequest,
];

export const timetableSlotCreateValidation = [
  body("schoolId").isInt().withMessage("Valid schoolId is required"),
  body("classroomId").isInt().withMessage("Valid classroom ID is required"),
  body("day")
    .isIn(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"])
    .withMessage("Invalid day"),
  body("slotType")
    .isIn(["CLASS", "BREAK", "LUNCH", "ACTIVITY"])
    .withMessage("Invalid slot type"),
  body("startTime")
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("startTime must be HH:mm"),
  body("endTime")
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("endTime must be HH:mm"),
];

export const timetableSlotUpdateValidation = [
  body("schoolId").optional().isInt(),
  body("classroomId").optional().isInt(),
  body("academicYearId").optional().isInt(),

  body("day")
    .optional()
    .isIn(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]),

  body("slotType").optional().isIn(["CLASS", "BREAK", "LUNCH", "ACTIVITY"]),

  body("startTime")
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("startTime must be HH:mm"),

  body("endTime")
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("endTime must be HH:mm"),
];

export const academicYearValidation = [
  body("label")
    .notEmpty()
    .matches(/^\d{4}-\d{4}$/)
    .withMessage("Label must be YYYY-YYYY"),
  body("startDate").isISO8601(),
  body("endDate").isISO8601(),
  validateRequest,
];

// For Stream
export const streamValidation = [
  body("name").notEmpty(),
  body("description").optional(),
  validateRequest,
];

// For StudentStream
export const studentStreamValidation = [
  body("studentId").isInt(),
  body("academicYearId").isInt(),
  body("classroomId").isInt(),
  body("streamId").optional().isInt(),
  validateRequest,
];
