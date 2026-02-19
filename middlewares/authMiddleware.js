import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../models/prisma.js";

// Load environment variables
dotenv.config();

export const authenticate = async (req, res, next) => {
  try {
    
    const authHeader = req.headers.authorization;
     // console.log("Authorization Header:", authHeader);
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ No Bearer token found");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    // console.log("Extracted Token Length:", token?.length);

    // console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log("Decoded Token:", decoded);

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

    console.log("User found in DB:", !!user);

    if (!user) {
      console.log("❌ Token valid but user not found");
      return res.status(401).json({ error: "User not Found" });
    }

    let resolvedSchoolId = user.school?.id || null;
    let resolvedSchoolCode = user.school?.schoolCode || null;

    if (!resolvedSchoolId || !resolvedSchoolCode) {
      if (user.staff?.school) {
        resolvedSchoolId = user.staff.school.id;
        resolvedSchoolCode = user.staff.school.schoolCode;
      } else if (user.student?.school) {
        resolvedSchoolId = user.student.school.id;
        resolvedSchoolCode = user.student.school.schoolCode;
      }
    }

    req.user = {
      ...decoded,
      id: user.id,
      userId: user.id,
      role: user.role,
      email: user.email,
      schoolId: resolvedSchoolId || undefined,
      schoolCode: resolvedSchoolCode || undefined,
    };
    // console.log("✅ Authentication successful for user:", user.id);
    console.log("---- AUTH DEBUG END ----");

    next();
  } catch (error) {
    console.log("❌ AUTH ERROR:", error.message);

    if (error instanceof jwt.TokenExpiredError) {
      console.log("Token expired");
      return res.status(401).json({ error: "Token expired" });
    }

    return res.status(401).json({ error: "Invalid token" });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Role ${req.user.role} is not authorized.`,
      });
    }
    next();
  };
};
