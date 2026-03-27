// import jwt from "jsonwebtoken";
// import dotenv from "dotenv";
// import prisma from "../models/prisma.js";

// // Load environment variables
// dotenv.config();

// export const authenticate = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;
//     // console.log("Authorization Header:", authHeader);
//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       console.log("❌ No Bearer token found");
//       return res.status(401).json({ error: "No token provided" });
//     }

//     const token = authHeader.split(" ")[1];
//     // console.log("Extracted Token Length:", token?.length);

//     // console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     // console.log("Decoded Token:", decoded);

//     const user = await prisma.user.findUnique({
//       where: { id: decoded.userId },
//       include: {
//         school: { select: { id: true, schoolCode: true } },
//         staff: {
//           include: { school: { select: { id: true, schoolCode: true } } },
//         },
//         student: {
//           include: { school: { select: { id: true, schoolCode: true } } },
//         },
//       },
//     });

//     // console.log("User found in DB:", !!user);

//     if (!user) {
//       return res.status(401).json({ error: "Invalid token" });
//     }

//     let resolvedSchoolId = user.school?.id || null;
//     let resolvedSchoolCode = user.school?.schoolCode || null;

//     if (!resolvedSchoolId || !resolvedSchoolCode) {
//       if (user.staff?.school) {
//         resolvedSchoolId = user.staff.school.id;
//         resolvedSchoolCode = user.staff.school.schoolCode;
//       } else if (user.student?.school) {
//         resolvedSchoolId = user.student.school.id;
//         resolvedSchoolCode = user.student.school.schoolCode;
//       }
//     }

//     req.user = {
//       ...decoded,
//       id: user.id,
//       userId: user.id,
//       role: user.role,
//       email: user.email,
//       schoolId: resolvedSchoolId || undefined,
//       schoolCode: resolvedSchoolCode || undefined,
//     };
//     // console.log("✅ Authentication successful for user:", user.id);
//     // console.log("---- AUTH DEBUG END ----");

//     next();
//   } catch (error) {
//     console.log("❌ AUTH ERROR:", error.message);

//     if (error instanceof jwt.TokenExpiredError) {
//       console.log("Token expired");
//       return res.status(401).json({ error: "Token expired" });
//     }

//     return res.status(401).json({ error: "Invalid token" });
//   }
// };

// export const authorize = (...roles) => {
//   return (req, res, next) => {
//     if (!req.user) {
//       return res.status(401).json({ error: "Not authenticated" });
//     }

//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({
//         error: `Access denied. Role ${req.user.role} is not authorized.`,
//       });
//     }
//     next();
//   };
// };

// middlewares/authMiddleware.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../models/prisma.js";

dotenv.config();

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    console.log("🔐 AUTH START: Checking authentication...");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ AUTH FAILED: No Bearer token found in header");
      console.log("Received header:", authHeader);
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    console.log("🔑 Token extracted (length):", token?.length);

    if (!process.env.JWT_SECRET) {
      console.log("❌ AUTH FAILED: JWT_SECRET is not set in environment");
      return res.status(500).json({ error: "Server configuration error" });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("✅ Token verified successfully");
      console.log("Decoded payload:", {
        userId: decoded.userId,
        role: decoded.role,
        schoolId: decoded.schoolId,
        exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
      });
    } catch (jwtError) {
      console.log("❌ JWT Verification Failed:", jwtError.message);
      if (jwtError instanceof jwt.TokenExpiredError) {
        console.log("Token has expired");
        return res.status(401).json({ error: "Token has expired" });
      }
      return res.status(401).json({ error: "Invalid token" });
    }

    if (!decoded.userId) {
      console.log("❌ AUTH FAILED: Token missing userId");
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Fetch user from database
    console.log(`🔍 Fetching user from DB with ID: ${decoded.userId}`);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        school: { select: { id: true, schoolCode: true } },
        staff: {
          include: { school: { select: { id: true, schoolCode: true } } },
        },
        student: {
          include: { school: { select: { id: true, schoolCode: true } } },
        },
      },
    });

    if (!user) {
      console.log(
        `❌ AUTH FAILED: User with ID ${decoded.userId} not found in database`,
      );
      return res.status(401).json({ error: "Invalid token - user not found" });
    }

    console.log(`✅ User found in DB: ID=${user.id}, Role=${user.role}`);

    // Resolve schoolId with clear logging
    let resolvedSchoolId = decoded.schoolId || user.school?.id;
    let resolvedSchoolCode = decoded.schoolCode || user.school?.schoolCode;

    if (!resolvedSchoolId) {
      console.log(
        "⚠️ No schoolId in token or user.school, checking staff/student relation...",
      );
      if (user.staff?.school) {
        resolvedSchoolId = user.staff.school.id;
        resolvedSchoolCode = user.staff.school.schoolCode;
        console.log(`✅ Resolved schoolId from staff: ${resolvedSchoolId}`);
      } else if (user.student?.school) {
        resolvedSchoolId = user.student.school.id;
        resolvedSchoolCode = user.student.school.schoolCode;
        console.log(`✅ Resolved schoolId from student: ${resolvedSchoolId}`);
      } else {
        console.log("⚠️ Could not resolve schoolId from any source");
      }
    } else {
      console.log(`✅ SchoolId resolved: ${resolvedSchoolId}`);
    }

    // Final req.user object
    req.user = {
      ...decoded, // Keep all original token data
      id: user.id,
      userId: user.id,
      role: user.role,
      email: user.email,
      schoolId: resolvedSchoolId,
      schoolCode: resolvedSchoolCode,
    };

    console.log("✅ AUTH SUCCESS: req.user created successfully");
    console.log("Final req.user:", {
      id: req.user.id,
      role: req.user.role,
      schoolId: req.user.schoolId,
    });

    next();
  } catch (error) {
    console.error("💥 AUTH CRITICAL ERROR:", error.message);
    console.error("Stack trace:", error.stack);

    if (error instanceof jwt.TokenExpiredError) {
      console.log("Token expired");
      return res.status(401).json({ error: "Token has expired" });
    }

    return res.status(401).json({ error: "Authentication failed" });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    console.log(
      `🔐 AUTHORIZE: Checking role. Required: ${roles}, User role: ${req.user?.role}`,
    );

    if (!req.user) {
      console.log("❌ AUTHORIZE FAILED: req.user is missing");
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!roles.includes(req.user.role)) {
      console.log(
        `❌ AUTHORIZE FAILED: Role ${req.user.role} not in allowed list [${roles}]`,
      );
      return res.status(403).json({
        error: `Access denied. Role ${req.user.role} is not authorized.`,
      });
    }

    console.log("✅ AUTHORIZE SUCCESS");
    next();
  };
};
