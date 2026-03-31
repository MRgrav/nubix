// utils\notificationService.js
import prisma from "../models/prisma.js";
import { sendPushNotification, sendMulticastNotification } from "./fcm.js";

// Create in-app notification + push notification
export const sendNotification = async ({
  userId,
  title,
  message,
  type = "SYSTEM",
  data = {},
  studentId = null,
  staffId = null,
  announcementId = null,
}) => {
  try {
    // 1. Create in-app notification
    const notification = await prisma.notification.create({
      data: {
        type,
        title,
        message,
        data,
        userId,
        studentId,
        staffId,
        announcementId,
      },
    });

    // 2. Send push notification if user has active FCM token
    const fcmTokens = await prisma.userFcmToken.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: { fcmToken: true },
    });

    if (fcmTokens.length > 0) {
      const tokens = fcmTokens.map(t => t.fcmToken);
      
      if (tokens.length === 1) {
        await sendPushNotification(tokens[0], title, message, {
          notificationId: notification.id.toString(),
          type,
          ...data,
        });
      } else {
        await sendMulticastNotification(tokens, title, message, {
          notificationId: notification.id.toString(),
          type,
          ...data,
        });
      }
    }

    return notification;
  } catch (err) {
    console.error("Failed to send notification:", err);
    return null;
  }
};