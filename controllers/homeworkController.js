// controllers/homeworkController.js
import prisma from "../models/prisma.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";
import { ensurePBAuth } from "../utils/pocketbase.js";
import pb from "../utils/pocketbase.js";
import z from "zod";

/** True if classroom name resolves to class 11 or 12 (digits or XI/XII). */
function classroomAllowsStream(classroomName) {
  if (!classroomName) return false;
  const m = classroomName.trim().toLowerCase().match(/(\d{1,2}|xi|xii)/i);
  if (!m) return false;
  const g = m[1].toLowerCase();
  const num = g === "xi" ? 11 : g === "xii" ? 12 : parseInt(g, 10);
  return num === 11 || num === 12;
}

// ─── Zod Schema ──────────────────────────────────────────────────────────────
const homeworkSchema = z.object({
  text: z.string().min(1, "Text is required"),
  description: z.string().nullish(),
  lastDate: z.string().min(1, "Last date is required"),
  classId: z.coerce.number().int().positive().nullish(),
  streamId: z.coerce.number().int().positive().nullish(),
});

// ─── 1. Create Homework ───────────────────────────────────────────────────────
export const createHomework = async (req, res) => {
  try {
    const parsed = homeworkSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        parsed.error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }

    const { text, description, lastDate, classId, streamId } = parsed.data;
    const file = req.file || null;

    let classroom = null;
    if (classId) {
      classroom = await prisma.classroom.findFirst({
        where: { id: Number(classId), schoolId: req.user.schoolId },
        select: { id: true, name: true },
      });
      if (!classroom) {
        return sendError(res, 404, "Classroom not found", "NOT_FOUND");
      }
    }

    if (streamId) {
      if (!classId || !classroom) {
        return sendError(
          res,
          400,
          "classId is required when streamId is set",
          "VALIDATION_ERROR",
        );
      }
      if (!classroomAllowsStream(classroom.name)) {
        return sendError(
          res,
          400,
          "Stream is allowed only for class 11 and 12",
          "VALIDATION_ERROR",
        );
      }
    }

    let fileUrl = null;
    let pocketbaseRecordId = null;
    let fileName = null;
    let mimeType = null;
    let fileSizeBytes = null;

    // Upload file to PocketBase if provided
    if (file) {
      await ensurePBAuth();

      const formData = new FormData();
      const fileBlob = new Blob([file.buffer], { type: file.mimetype });
      formData.append("file", fileBlob, file.originalname);
      formData.append("mimeType", file.mimetype);
      formData.append("fileSizeBytes", file.size.toString());

      const pbRecord = await pb.collection("homework_documents").create(formData);

      fileUrl = `${process.env.POCKETBASE_URL}/api/files/homework_documents/${pbRecord.id}/${pbRecord.file}`;
      pocketbaseRecordId = pbRecord.id;
      fileName = file.originalname;
      mimeType = file.mimetype;
      fileSizeBytes = file.size;
    }

    const homework = await prisma.homework.create({
      data: {
        text,
        ...(description !== undefined && { description }),
        lastDate: new Date(lastDate),
        fileUrl,
        pocketbaseRecordId,
        fileName,
        mimeType,
        fileSizeBytes,
        ...(classId && { classId: Number(classId) }),
        ...(streamId && { streamId: Number(streamId) }),
        schoolId: req.user.schoolId,
        createdById: req.user.id,
      },
      include: {
        createdBy: { select: { id: true, email: true, role: true } },
        classroom: { select: { id: true, name: true, section: true } },
        stream: { select: { id: true, name: true } },
      },
    });

    return sendSuccess(res, 201, homework, "Homework created successfully");
  } catch (err) {
    console.error("Create homework error:", err);
    return sendError(res, 500, "Failed to create homework", err.message);
  }
};

// ─── 2. Get All Homeworks ─────────────────────────────────────────────────────
export const getHomeworks = async (req, res) => {
  const { page = 1, limit = 20, classId, streamId } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = { schoolId: req.user.schoolId };
    if (classId) where.classId = Number(classId);
    if (streamId) where.streamId = Number(streamId);

    const [total, homeworks] = await prisma.$transaction([
      prisma.homework.count({ where }),
      prisma.homework.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true, email: true, role: true } },
          classroom: { select: { id: true, name: true, section: true } },
          stream: { select: { id: true, name: true } },
        },
      }),
    ]);

    return sendSuccess(res, 200, homeworks, "Homeworks fetched", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
      hasNext: Number(page) < Math.ceil(total / take),
      hasPrev: Number(page) > 1,
    });
  } catch (err) {
    console.error("Get homeworks error:", err);
    return sendError(res, 500, "Failed to fetch homeworks", err.message);
  }
};

// ─── 3. Get Single Homework ───────────────────────────────────────────────────
export const getHomework = async (req, res) => {
  try {
    const homework = await prisma.homework.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        createdBy: { select: { id: true, email: true, role: true } },
        classroom: { select: { id: true, name: true, section: true } },
        stream: { select: { id: true, name: true } },
      },
    });

    if (!homework) return sendError(res, 404, "Homework not found");

    return sendSuccess(res, 200, homework, "Homework fetched");
  } catch (err) {
    console.error("Get homework error:", err);
    return sendError(res, 500, "Failed to fetch homework", err.message);
  }
};

// ─── 4. Delete Homework ───────────────────────────────────────────────────────
export const deleteHomework = async (req, res) => {
  try {
    const homework = await prisma.homework.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!homework) return sendError(res, 404, "Homework not found");

    // Delete PocketBase record if exists
    if (homework.pocketbaseRecordId) {
      try {
        await ensurePBAuth();
        await pb.collection("homework_documents").delete(homework.pocketbaseRecordId);
      } catch (pbErr) {
        console.warn("PocketBase delete failed (continuing):", pbErr.message);
      }
    }

    await prisma.homework.delete({ where: { id: Number(req.params.id) } });

    return sendSuccess(res, 200, null, "Homework deleted successfully");
  } catch (err) {
    console.error("Delete homework error:", err);
    return sendError(res, 500, "Failed to delete homework", err.message);
  }
};
