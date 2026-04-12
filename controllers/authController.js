import prisma from "../models/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { sendError, sendSuccess } from "../utils/responseStructure.js";
import { getActiveAcademicYear } from "../utils/academicYearHelper.js";
import { sendOTPEmail } from "../utils/emailService.js";

// Create email transporter - Replace with your email service in production
const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

export const generateTokens = (
  userId,
  role,
  schoolId,
  actingAsStudentId = null,
) => {
  const payload = { userId, role, schoolId };
  if (actingAsStudentId) payload.actingAsStudentId = actingAsStudentId;

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "3h",
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });

  return { accessToken, refreshToken };
};

export const generateSecurePassword = () => {
  // Generate a random password with at least one uppercase, one lowercase, one number
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Excluding I and O for clarity
  const lowercase = "abcdefghijkmnpqrstuvwxyz"; // Excluding l and o for clarity
  const numbers = "23456789"; // Excluding 0 and 1 for clarity
  const special = "@#$%&";

  let password = "";
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));

  // Add 4 more random characters
  const allChars = uppercase + lowercase + numbers;
  for (let i = 0; i < 4; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
};

export const createUser = async (req, res) => {
  const { email, name, role, schoolId, staffRole } = req.body;

  // Only admin can create users
  if (req.user.role !== "ADMIN") {
    return res
      .status(403)
      .json({ error: "Only administrators can create users" });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Generate a secure random password
    const password = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and associated profile in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      const user = await prisma.user.create({
        data: { email, password: hashedPassword, role },
      });

      // Create associated profile based on role
      if (role === "STUDENT") {
        await prisma.student.create({
          data: {
            name,
            email,
            schoolId: parseInt(schoolId),
            userId: user.id,
          },
        });
      } else if (role === "STAFF") {
        await prisma.staff.create({
          data: {
            name,
            email,
            role: staffRole || "TEACHER",
            schoolId: parseInt(schoolId),
            userId: user.id,
          },
        });
      }

      return user;
    });

    // Return the generated password (in a real system, this should be emailed)
    res.json({
      message: "User created successfully",
      userId: result.id,
      email,
      temporaryPassword: password,
      note: "Please securely share these credentials with the user",
    });
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "User creation failed" });
  }
};

// One-time bootstrap endpoint to create the initial ADMIN user.
// Requires `BOOTSTRAP_ADMIN_SECRET` env var to match `bootstrapSecret` sent in the request body.
export const setupAdmin = async (req, res) => {
  try {
    const { email, name, password, schoolCode, schoolName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    //  Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // SCHOOL HANDLING
    let schoolId = null;
    if (schoolCode) {
      const code = String(schoolCode).trim();

      let school = await prisma.school.findUnique({
        where: { schoolCode: code },
      });

      if (!school) {
        school = await prisma.school.create({
          data: {
            name: schoolName || `School ${code}`,
            schoolCode: code,
          },
        });
      }

      schoolId = school.id;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      email,
      password: hashedPassword,
      role: "ADMIN",
      ...(schoolId && { schoolId }),
    };

    const user = await prisma.user.create({ data: userData });

    res.status(201).json({
      message: "Admin user created",
      userId: user.id,
      email,
      schoolId,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: err.message || "Failed to set up admin user" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendError(
      res,
      400,
      "Email and password are required",
      "VALIDATION_ERROR",
    );
  }
  try {
    // Fetch the active academic year
    const activeYear = await getActiveAcademicYear();
    const activeYearId = activeYear?.id;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            grade: true,
            classroom: {
              select: {
                id: true,
                name: true,
                section: true,
              },
            },
            school: { select: { id: true, name: true, schoolCode: true } },
            ...(activeYearId && {
              studentStreams: {
                where: { academicYearId: activeYearId },
                select: {
                  rollNo: true,
                  stream: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            }),
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
            school: { select: { id: true, name: true, schoolCode: true } },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    let tokens = generateTokens(user.id, user.role, user.schoolId);

    // Remove sensitive data
    const { password: _, ...userWithoutPassword } = user;

    if (user.role === "PARENT") {
      const parent = await prisma.parent.findFirst({
        where: { userId: user.id },
      });

      if (!parent) {
        return sendError(
          res,
          403,
          "Parent profile not linked",
          "PROFILE_NOT_FOUND",
        );
      }

      const childrenLinks = await prisma.studentParent.findMany({
        where: { parentId: parent.id },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              grade: true,
              classroom: { select: { id: true, name: true, section: true } },
              school: { select: { id: true, name: true, schoolCode: true } },
              ...(activeYearId && {
                studentStreams: {
                  where: { academicYearId: activeYearId },
                  select: { rollNo: true, stream: { select: { name: true } } },
                },
              }),
            },
          },
        },
      });

      const children = childrenLinks.map((link) => {
        const activeStream = link.student.studentStreams?.[0] || null;
        return {
          studentId: link.student.id,
          name: link.student.name,
          grade: link.student.grade || null,
          classroom: activeStream?.classroom || link.student.classroom,
          school: link.student.school,
          rollNo: activeStream?.rollNo || null,
          stream: activeStream?.stream || null,
          isPrimary: link.isPrimary,
        };
      });

      // If only one child → auto-select
      let actingAs = null;
      if (children.length === 1) {
        actingAs = children[0];
        tokens = generateTokens(
          user.id,
          user.role,
          user.schoolId,
          actingAs.studentId,
        );
      }

      return sendSuccess(
        res,
        200,
        {
          user: userWithoutPassword,
          parent: { id: parent.id, name: parent.name, email: parent.email },
          children,
          ...(actingAs && { actingAs }),
          ...tokens,
        },
        children.length === 0
          ? "Parent login successful - no children linked"
          : "Parent login successful",
      );
    }

    res.json({
      message: "Login successful",
      user: userWithoutPassword,
      ...tokens,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
};

export const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Preserve actingAsStudentId if present in decoded payload
    const actingAsStudentId = decoded.actingAsStudentId || null;

    const tokens = generateTokens(
      user.id,
      user.role,
      user.schoolId,
      actingAsStudentId,
    );
    res.json(tokens);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: "Refresh token expired" });
    }
    res.status(401).json({ error: "Invalid refresh token" });
  }
};

/**
 * Admin-only: Update own admin profile
 * Allowed fields: name, email, schoolId, password (with current password verification)
 */
export const updateAdminProfile = async (req, res) => {
  try {
    // Only ADMIN can update their own profile
    if (!req.user || req.user.role !== "ADMIN") {
      return sendError(
        res,
        403,
        "Only administrators can update their profile",
      );
    }

    const userId = req.user.userId;
    const { email, schoolId } = req.body;

    // At least one field must be provided
    if (!email && !schoolId) {
      return sendError(
        res,
        400,
        "At least one field ( email, schoolId) is required",
      );
    }

    // Fetch current admin data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        schoolId: true,
      },
    });

    if (!currentUser) {
      return sendError(res, 404, "Admin profile not found");
    }

    const updateData = {};

    // Email update + uniqueness check
    if (email && email.trim() !== currentUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: { email: email.trim(), id: { not: userId } },
      });
      if (emailExists) {
        return sendError(res, 409, "Email is already in use by another user");
      }
      updateData.email = email.trim();
    }

    // SchoolId update
    if (schoolId !== undefined && Number(schoolId) !== currentUser.schoolId) {
      // Optional: validate school exists
      const schoolExists = await prisma.school.findUnique({
        where: { id: Number(schoolId) },
      });
      if (!schoolExists) {
        return sendError(res, 404, "School not found");
      }
      updateData.schoolId = Number(schoolId);
    }

    // If nothing to update
    if (Object.keys(updateData).length === 0) {
      return sendError(res, 400, "No changes provided");
    }

    // Perform update in transaction
    const updatedUser = await prisma.$transaction(async (tx) => {
      return tx.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          role: true,
          schoolId: true,
          createdAt: true,
        },
      });
    });

    return sendSuccess(res, 200, {
      message: "Admin profile updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Update admin profile error:", err);

    if (err.code === "P2002") {
      return sendError(res, 409, "Email is already in use");
    }

    return sendError(res, 500, "Failed to update admin profile", err.message);
  }
};

// 1. Request OTP for Password Reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, 400, "Email is required", "VALIDATION_ERROR");
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return sendError(
        res,
        404,
        "No account found with this email",
        "USER_NOT_FOUND",
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Upsert using the unique 'token' field + userId combination
    await prisma.passwordResetToken.upsert({
      where: {
        userId: user.id, // This works if you have a compound unique or just use token as primary lookup
      },
      update: {
        token: otp,
        expiresAt,
        used: false,
      },
      create: {
        userId: user.id,
        token: otp,
        expiresAt,
        used: false,
      },
    });

    // Send OTP via email
    await sendOTPEmail(email, otp);

    // console.log(`✅ OTP ${otp} sent to ${email}`);

    return sendSuccess(
      res,
      200,
      null,
      "OTP sent to your email. Valid for 10 minutes.",
    );
  } catch (err) {
    console.error("Request password reset error:", err);
    return sendError(res, 500, "Failed to send OTP", "INTERNAL_ERROR");
  }
};

// 2. Reset Password using OTP
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Detailed logging for debugging
    // console.log("Reset password request received with body:", req.body);

    if (!email || !otp || !newPassword) {
      return sendError(
        res,
        400,
        "Email, OTP, and new password are all required",
        "VALIDATION_ERROR",
      );
    }

    // Trim and normalize
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.toString().trim();

    if (normalizedOtp.length !== 6) {
      return sendError(res, 400, "OTP must be 6 digits", "INVALID_OTP");
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return sendError(
        res,
        404,
        "No account found with this email",
        "USER_NOT_FOUND",
      );
    }

    // Find valid OTP
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        token: normalizedOtp,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetToken) {
      return sendError(
        res,
        400,
        "Invalid or expired OTP. Please request a new one.",
        "INVALID_OTP",
      );
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and mark token as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    // console.log(`✅ Password reset successful for user: ${normalizedEmail}`);

    return sendSuccess(
      res,
      200,
      null,
      "Password has been reset successfully. You can now login with your new password.",
    );
  } catch (err) {
    console.error("Reset password error:", err);
    return sendError(
      res,
      500,
      "Failed to reset password. Please try again.",
      "INTERNAL_ERROR",
    );
  }
};
