// controllers\notificationController.js
import prisma from "../models/prisma.js";
import { sendSuccess, sendError } from "../utils/responseStructure.js";

// Create a notification (used internally by other modules)
export const createNotification = async (data) => {
  return prisma.notification.create({
    data: {
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data || {},
      userId: data.userId,
      studentId: data.studentId,
      staffId: data.staffId,
      announcementId: data.announcementId,
    },
  });
};

// Get all notifications for current user (Student / Parent / Staff)
export const getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, isRead } = req.query;

    const where = { userId: req.user.id };

    if (isRead !== undefined) {
      where.isRead = isRead === "true";
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, notifications] = await prisma.$transaction([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          announcement: { select: { id: true, title: true } },
        },
      }),
    ]);

    return sendSuccess(res, 200, notifications, "Notifications fetched", {
      total,
      pages: Math.ceil(total / take),
      currentPage: Number(page),
      perPage: take,
    });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to fetch notifications");
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: { id: Number(id), userId: req.user.id },
      data: { isRead: true, readAt: new Date() },
    });

    return sendSuccess(res, 200, notification, "Notification marked as read");
  } catch (err) {
    return sendError(res, 404, "Notification not found or not authorized");
  }
};

// Mark all as read
export const markAllAsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return sendSuccess(res, 200, null, "All notifications marked as read");
  } catch (err) {
    return sendError(res, 500, "Failed to mark all as read");
  }
};


// controllers/notificationController.js
export const registerFcmToken = async (req, res) => {
  try {
    const { fcmToken, deviceType, deviceName } = req.body;

    if (!fcmToken) {
      return sendError(res, 400, "fcmToken is required");
    }

    await prisma.userFcmToken.upsert({
      where: { fcmToken },
      update: {
        isActive: true,
        deviceType: deviceType || "ANDROID",
        deviceName: deviceName,
      },
      create: {
        userId: req.user.id,
        fcmToken,
        deviceType: deviceType || "ANDROID",
        deviceName: deviceName,
        isActive: true,
      },
    });

    return sendSuccess(res, 200, null, "FCM token registered successfully");
  } catch (err) {
    console.error(err);
    return sendError(res, 500, "Failed to register token");
  }
};