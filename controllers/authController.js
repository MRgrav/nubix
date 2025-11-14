import prisma from '../models/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// Create email transporter - Replace with your email service in production
const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
  
  const refreshToken = jwt.sign(
    { userId, role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
};

const generateSecurePassword = () => {
  // Generate a random password with at least one uppercase, one lowercase, one number
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  // Excluding I and O for clarity
  const lowercase = 'abcdefghijkmnpqrstuvwxyz';  // Excluding l and o for clarity
  const numbers = '23456789';  // Excluding 0 and 1 for clarity
  const special = '@#$%&';
  
  let password = '';
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));
  
  // Add 4 more random characters
  const allChars = uppercase + lowercase + numbers;
  for(let i = 0; i < 4; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

export const createUser = async (req, res) => {
  const { email, name, role, schoolId, staffRole } = req.body;
  
  // Only admin can create users
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only administrators can create users' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate a secure random password
    const password = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user and associated profile in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      const user = await prisma.user.create({
        data: { email, password: hashedPassword, role }
      });

      // Create associated profile based on role
      if (role === 'STUDENT') {
        await prisma.student.create({
          data: {
            name,
            email,
            schoolId: parseInt(schoolId),
            userId: user.id
          }
        });
      } else if (role === 'STAFF') {
        await prisma.staff.create({
          data: {
            name,
            email,
            role: staffRole || 'TEACHER',
            schoolId: parseInt(schoolId),
            userId: user.id
          }
        });
      }

      return user;
    });

    // Return the generated password (in a real system, this should be emailed)
    res.json({
      message: 'User created successfully',
      userId: result.id,
      email,
      temporaryPassword: password,
      note: 'Please securely share these credentials with the user'
    });
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'User creation failed' });
  }
};

// One-time bootstrap endpoint to create the initial ADMIN user.
// Requires `BOOTSTRAP_ADMIN_SECRET` env var to match `bootstrapSecret` sent in the request body.
export const setupAdmin = async (req, res) => {
  try {
    const { bootstrapSecret, email, name, password } = req.body;

    if (!process.env.BOOTSTRAP_ADMIN_SECRET) {
      return res.status(500).json({ error: 'Bootstrap not configured on server' });
    }

    if (!bootstrapSecret || bootstrapSecret !== process.env.BOOTSTRAP_ADMIN_SECRET) {
      return res.status(403).json({ error: 'Invalid bootstrap secret' });
    }

    // Prevent creating additional admins if one already exists
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount > 0) {
      return res.status(400).json({ error: 'An admin account already exists' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'ADMIN'
      }
    });

    res.status(201).json({ message: 'Admin user created', userId: user.id, email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            school: { select: { id: true, name: true } }
          }
        },
        staff: {
          select: {
            id: true,
            name: true,
            school: { select: { id: true, name: true } }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const tokens = generateTokens(user.id, user.role);

    // Remove sensitive data
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      ...tokens
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tokens = generateTokens(user.id, user.role);
    res.json(tokens);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set token expiry to 10 minutes from now
    const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Save reset token and expiry to user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: passwordResetToken,
        resetTokenExpiresAt: passwordResetExpires
      }
    });

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <p>You requested a password reset.</p>
        <p>Click this link to reset your password (valid for 10 minutes):</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>If you didn't request this, please ignore this email.</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({
      message: 'Password reset link sent to email'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Error sending password reset email'
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Hash the token for comparison
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiresAt: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired reset token'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user's password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiresAt: null
      }
    });

    res.json({
      message: 'Password reset successful'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Error resetting password'
    });
  }
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update password' });
  }
};
