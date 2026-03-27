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
import prisma from "../models/prisma.js";

export const authenticate = async (req, res, next) => {
  console.log("🔐 AUTH START: New request received");

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ AUTH FAILED: No Bearer token in header");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    console.log(`🔑 Token received (length: ${token.length})`);

    if (!process.env.JWT_SECRET) {
      console.log("❌ AUTH FAILED: JWT_SECRET environment variable is missing");
      return res.status(500).json({ error: "Server configuration error" });
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("✅ JWT verified successfully");
      console.log("Decoded payload:", {
        userId: decoded.userId,
        role: decoded.role,
        schoolId: decoded.schoolId,
      });
    } catch (jwtErr) {
      console.log("❌ JWT Verification Failed:", jwtErr.message);
      if (jwtErr instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ error: "Token has expired" });
      }
      return res.status(401).json({ error: "Invalid token" });
    }

    if (!decoded.userId) {
      console.log("❌ AUTH FAILED: Token missing userId");
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Fetch user from database
    console.log(`🔍 Looking up user ID: ${decoded.userId}`);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        school: { select: { id: true, schoolCode: true } },
        staff: { select: { id: true, schoolId: true } },
        student: { select: { id: true, schoolId: true } },
      },
    });

    if (!user) {
      console.log(
        `❌ AUTH FAILED: User ID ${decoded.userId} not found in database`,
      );
      return res.status(401).json({ error: "Invalid token - user not found" });
    }

    console.log(`✅ User found → ID: ${user.id}, Role: ${user.role}`);

    // Resolve schoolId (priority: token > user.school > staff > student)
    const schoolId =
      decoded.schoolId ||
      user.school?.id ||
      user.staff?.schoolId ||
      user.student?.schoolId;

    if (!schoolId) {
      console.log("⚠️ Warning: Could not resolve schoolId for this user");
    } else {
      console.log(`🏫 School resolved: ${schoolId}`);
    }

    // Final req.user object
    req.user = {
      id: user.id,
      userId: user.id,
      role: user.role,
      email: user.email,
      schoolId: schoolId,
      // Preserve any extra data from token (like actingAsStudentId)
      ...decoded,
    };

    console.log("✅ AUTH SUCCESS: req.user attached successfully");
    console.log("Final req.user role:", req.user.role);

    next();
  } catch (error) {
    console.error("💥 CRITICAL AUTH ERROR:", error.message);
    console.error("Stack:", error.stack);

    return res.status(401).json({ error: "Authentication failed" });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    console.log(
      `🔐 AUTHORIZE: Checking role. Required: [${roles.join(", ")}], User role: ${req.user?.role || "undefined"}`,
    );

    if (!req.user) {
      console.log(
        "❌ AUTHORIZE FAILED: req.user is missing (authenticate did not run or failed)",
      );
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!roles.includes(req.user.role)) {
      console.log(`❌ AUTHORIZE FAILED: Role ${req.user.role} not allowed`);
      return res.status(403).json({
        error: `Access denied. Role ${req.user.role} is not authorized.`,
      });
    }

    console.log("✅ AUTHORIZE SUCCESS");
    next();
  };
};
