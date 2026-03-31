import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// ==================== SERVICE ACCOUNT SETUP ====================

let serviceAccount = null;

try {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };

    console.log(
      "✅ Firebase service account loaded successfully from environment variables",
    );
  } else {
    console.warn(
      "⚠️  Missing Firebase environment variables (PROJECT_ID, CLIENT_EMAIL, or PRIVATE_KEY)",
    );
    console.warn("Push notifications will be disabled.");
  }
} catch (err) {
  console.error("❌ Error processing Firebase service account:", err.message);
  console.warn("Push notifications will be disabled.");
}

// ==================== INITIALIZE FIREBASE ADMIN ====================

if (!admin.apps.length && serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin SDK initialized successfully");
  } catch (error) {
    console.error("❌ Firebase Admin initialization failed:", error.message);
    serviceAccount = null; // disable notifications
  }
} else if (!serviceAccount) {
  console.warn(
    "⚠️ Firebase Admin not initialized. Push notifications disabled.",
  );
}

// ==================== SEND NOTIFICATION FUNCTIONS ====================

export const sendPushNotification = async (
  fcmToken,
  title,
  body,
  data = {},
) => {
  if (!serviceAccount || !fcmToken) {
    console.log("Push notification skipped: no service account or FCM token");
    return false;
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: {
      ...data,
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    android: { priority: "high" },
    apns: {
      headers: { "apns-priority": "10" },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("✅ Push sent successfully:", response);
    return true;
  } catch (error) {
    console.error("❌ Push notification failed:", error.message);

    // Auto deactivate invalid tokens
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      // await prisma.userFcmToken.updateMany({ where: { fcmToken }, data: { isActive: false } });
      console.log(`🔄 Deactivated invalid token: ${fcmToken}`);
    }
    return false;
  }
};

export const sendMulticastNotification = async (
  fcmTokens,
  title,
  body,
  data = {},
) => {
  if (!serviceAccount || !fcmTokens?.length) return false;

  const message = {
    tokens: fcmTokens,
    notification: { title, body },
    data,
  };

  try {
    const response = await admin.messaging().sendMulticast(message);
    console.log(
      `✅ Multicast: ${response.successCount} success, ${response.failureCount} failures`,
    );
    return response;
  } catch (error) {
    console.error("❌ Multicast failed:", error.message);
    return false;
  }
};
