// middlewares\upload.js
import multer from "multer";

const storage = multer.memoryStorage();

export const uploadAdmissionDocs = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
}).array("documents", 10);

export const uploadStaffDocs = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 15,
  },
}).array("documents", 10);

export const uploadSchoolDocs = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 15,
  },
}).array("documents", 10);

export const uploadAnnouncementDoc = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 15,
  },
}).array("documents", 2);

export const uploadHomeworkDoc = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
}).single("file");
