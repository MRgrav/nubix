// utils\notificationService.js
import prisma from "../models/prisma.js";
import { sendPushNotification, sendMulticastNotification } from "./fcm.js";

// Create in-app notification + push notification
// export const sendNotification = async ({
//   userId,
//   title,
//   message,
//   type = "SYSTEM",
//   data = {},
//   studentId = null,
//   staffId = null,
//   announcementId = null,
// }) => {
//   try {
//     // 1. Create in-app notification
//     const notification = await prisma.notification.create({
//       data: {
//         type,
//         title,
//         message,
//         data: data || {},
//         userId,
//         studentId: studentId || null,
//         staffId: staffId || null,
//         announcementId: announcementId || null,
//       },
//     });

//     // 2. Send push notification if user has active FCM token
//     const fcmTokens = await prisma.userFcmToken.findMany({
//       where: {
//         userId,
//         isActive: true,
//       },
//       select: { fcmToken: true },
//     });

//     if (fcmTokens.length === 0) {
//       console.log(`⚠️ No active FCM token found for user ${userId}`);
//       return notification;
//     }

//     const stringData = {};
//     Object.keys(data || {}).forEach((key) => {
//       stringData[key] = String(data[key]);
//     });

//     const pushResult = await sendPushNotification(
//       fcmTokens.map((t) => t.fcmToken),
//       title,
//       message,
//       stringData,
//     );

//     if (pushResult) {
//       console.log(
//         `✅ Push sent successfully to user ${userId} (${fcmTokens.length} tokens)`,
//       );
//     } else {
//       console.log(`❌ Push failed for user ${userId}`);
//     }

//     return notification;
//   } catch (err) {
//     console.error(`Failed to send notification to user ${userId}:`, err);
//     // Still return the in-app notification even if push fails
//     return null;
//   }
// };

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
    console.log(`[Notification] Starting for user ${userId}, type: ${type}`);

    // 1. Create in-app notification
    const notification = await prisma.notification.create({
      data: {
        type,
        title,
        message,
        data: data || {},
        userId,
        studentId: studentId || null,
        staffId: staffId || null,
        announcementId: announcementId || null,
      },
    });

    console.log(`[Notification] In-app record created for user ${userId}`);

    // 2. Get active FCM tokens
    const fcmRecords = await prisma.userFcmToken.findMany({
      where: { userId, isActive: true },
      select: { fcmToken: true },
    });

    if (fcmRecords.length === 0) {
      console.log(`⚠️ No active FCM token found for user ${userId}`);
      return notification;
    }

    console.log(
      `[Notification] Found ${fcmRecords.length} active token(s) for user ${userId}`,
    );

    // 3. Convert data to strings (FCM requirement)
    const stringData = {};
    Object.keys(data || {}).forEach((key) => {
      stringData[key] = String(data[key] || "");
    });

    // 4. Send Push - Use MULTICAST when multiple tokens, single when one
    let pushResult = false;

    if (fcmRecords.length === 1) {
      pushResult = await sendPushNotification(
        fcmRecords[0].fcmToken,
        title,
        message,
        stringData,
      );
    } else {
      pushResult = await sendMulticastNotification(
        fcmRecords.map((r) => r.fcmToken),
        title,
        message,
        stringData,
      );
    }

    if (pushResult) {
      console.log(
        `✅ Push sent successfully to user ${userId} (${fcmRecords.length} token(s))`,
      );
    } else {
      console.log(`❌ Push failed for user ${userId}`);
    }

    return notification;
  } catch (err) {
    console.error(
      `❌ Failed to send notification to user ${userId}:`,
      err.message,
    );
    return null;
  }
};
