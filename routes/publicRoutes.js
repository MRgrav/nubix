import express from "express";

import { getClassesDropdownPublic } from "../controllers/classController.js";
import { getOnlyStreamsPublic } from "../controllers/streamController.js";
const router = express.Router();

router.get("/classrooms", getClassesDropdownPublic);
router.get("/streams", getOnlyStreamsPublic);

export default router;
