// controllers\staffAttendanceController.js
import prisma from "./../models/prisma.js";
import { calculateDistanceMeters } from "../utils/geoDistance.js";
import { getActiveAcademicYear } from "./../utils/academicYearHelper.js";
import { sendError, sendSuccess } from "./../utils/responseStructure.js";
import { DateTime } from "luxon";
import z from "zod";

const attendanceQuerySchema = z.object({
  staffId: z.coerce.number().int().positive().optional(),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED"]).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export const markStaffGeoAttendance = async (req, res) => {
  try {
    const { latitude, longitude, status = "PRESENT", note } = req.body;

    if (!latitude || !longitude) {
      return sendError(res, 400, "latitude and longitude are required");
    }

    const user = req.user;
    if (user.role !== "STAFF") {
      return sendError(res, 403, "Only STAFF can mark geo attendance");
    }

    const staff = await prisma.staff.findUnique({
      where: { userId: user.id },
      select: { id: true, schoolId: true },
    });
    if (!staff) return sendError(res, 404, "Staff profile not found");

    const school = await prisma.school.findUnique({
      where: { id: staff.schoolId },
      select: { latitude: true, longitude: true, geoRadiusMeters: true },
    });
    if (!school?.latitude || !school?.longitude) {
      return sendError(res, 400, "School geo-location not configured");
    }

    const distanceMeters = calculateDistanceMeters(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(school.latitude),
      parseFloat(school.longitude),
    );

    const allowedRadius = school.geoRadiusMeters || 50;
    const isWithinRange = distanceMeters <= allowedRadius;

    if (!isWithinRange) {
      return sendError(
        res,
        403,
        `Out of range! You are ${Math.round(distanceMeters)} meters away (Allowed: ${allowedRadius}m)`,
        "OUT_OF_RANGE",
      );
    }

    // Get active academic year
    const activeYear = await getActiveAcademicYear(staff.schoolId);
    if (!activeYear) {
      return sendError(res, 400, "No active academic year found");
    }

    // Reliable IST date and time using luxon
    const nowIST = DateTime.now().setZone("Asia/Kolkata");
    const dateOnly = nowIST.startOf("day").toJSDate(); // midnight IST as UTC Date
    const timeOnly = nowIST.toFormat("HH:mm");

    // Upsert attendance (one per day)
    const attendance = await prisma.staffAttendance.upsert({
      where: {
        staffId_dateOnly: {
          staffId: staff.id,
          dateOnly: dateOnly,
        },
      },
      update: {
        timeOnly,
        status: status.toUpperCase(),
        note: note || null,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        distanceMeters: Math.round(distanceMeters),
        isWithinRange: true,
        updatedAt: new Date(),
      },
      create: {
        staffId: staff.id,
        dateOnly,
        timeOnly,
        status: status.toUpperCase(),
        note: note || null,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        distanceMeters: Math.round(distanceMeters),
        isWithinRange: true,
        academicYearId: activeYear.id,
      },
      include: {
        academicYear: { select: { label: true } },
      },
    });

    // Format response with readable IST date
    const formattedDate = nowIST.toISODate(); // "2026-03-27"

    return sendSuccess(res, 201, attendance, {
      attendanceDateIST: formattedDate,
      timeIST: timeOnly,
      message: `Attendance marked at ${timeOnly} IST on ${formattedDate}`,
      distance: `${Math.round(distanceMeters)} meters`,
    });
  } catch (err) {
    console.error("Geo staff attendance error:", err);
    if (err.code === "P2002") {
      return sendError(
        res,
        409,
        "Attendance already recorded for today",
        "DUPLICATE_ENTRY",
      );
    }
    return sendError(res, 500, "Failed to mark geo attendance", err.message);
  }
};

export const getAllStaffAttendances = async (req, res) => {
  try {
    // Validate query parameters
    const query = attendanceQuerySchema.parse(req.query);
    const { staffId, status, fromDate, toDate, academicYearId, page, limit } =
      query;

    // Build `where` clause
    const where = {};

    if (staffId) where.staffId = staffId;
    if (status) where.status = status;
    if (academicYearId) where.academicYearId = academicYearId;

    // Date range filter (use `dateOnly` field)
    if (fromDate || toDate) {
      where.dateOnly = {};
      if (fromDate) where.dateOnly.gte = new Date(fromDate);
      if (toDate) where.dateOnly.lte = new Date(toDate);
    }

    // Pagination
    const skip = (page - 1) * limit;
    const take = limit;

    // Run count and list queries in parallel
    const [total, attendances] = await prisma.$transaction([
      prisma.staffAttendance.count({ where }),
      prisma.staffAttendance.findMany({
        where,
        skip,
        take,
        // orderBy: { dateOnly: "desc", timeOnly: "desc" },
        include: {
          staff: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          academicYear: { select: { id: true, label: true } },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return sendSuccess(
      res,
      200,
      attendances,
      "Staff attendances fetched successfully",
      {
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    );
  } catch (err) {
    console.error("Get all staff attendances error:", err);
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    return sendError(
      res,
      500,
      "Failed to fetch staff attendances",
      err.message,
    );
  }
};

export const getMyStaffAttendances = async (req, res) => {
  try {
    // Get staff profile from the logged‑in user
    const staff = await prisma.staff.findUnique({
      where: { userId: req.user.id },
      select: { id: true, name: true, email: true },
    });
    if (!staff) {
      return sendError(res, 404, "Staff profile not found", "NOT_FOUND");
    }

    // Validate query parameters (same schema, but staffId is fixed)
    const query = attendanceQuerySchema.parse(req.query);
    const { status, fromDate, toDate, academicYearId, page, limit } = query;

    // Build `where` clause for the logged‑in staff
    const where = {
      staffId: staff.id,
    };
    if (status) where.status = status;
    if (academicYearId) where.academicYearId = academicYearId;
    if (fromDate || toDate) {
      where.dateOnly = {};
      if (fromDate) where.dateOnly.gte = new Date(fromDate);
      if (toDate) where.dateOnly.lte = new Date(toDate);
    }

    // Pagination
    const skip = (page - 1) * limit;
    const take = limit;

    // Run count, list, and summary in parallel
    const [total, attendances, summary] = await prisma.$transaction([
      prisma.staffAttendance.count({ where }),
      prisma.staffAttendance.findMany({
        where,
        skip,
        take,
        // orderBy: { dateOnly: "desc", timeOnly: "desc" },
        include: {
          academicYear: { select: { id: true, label: true } },
        },
      }),
      // Summary stats (only for the filtered period)
      prisma.staffAttendance.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),
    ]);

    // Convert summary into a readable object
    const stats = {
      totalDays: total,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
    };
    for (const item of summary) {
      const count = item._count.status;
      switch (item.status) {
        case "PRESENT":
          stats.present = count;
          break;
        case "LATE":
          stats.late = count;
          break;
        case "ABSENT":
          stats.absent = count;
          break;
        case "EXCUSED":
          stats.excused = count;
          break;
      }
    }
    const effectivePresent = stats.present + stats.late;
    stats.percentage = total > 0 ? (effectivePresent / total) * 100 : 0;

    const totalPages = Math.ceil(total / limit);

    return sendSuccess(
      res,
      200,
      {
        staff: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
        },
        summary: stats,
        records: attendances,
      },
      "Your attendance records fetched successfully",
      {
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    );
  } catch (err) {
    console.error("Get my staff attendances error:", err);
    if (err instanceof z.ZodError) {
      return sendError(
        res,
        400,
        err.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
      );
    }
    return sendError(res, 500, "Failed to fetch your attendance", err.message);
  }
};
