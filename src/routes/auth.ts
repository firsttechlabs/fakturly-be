import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import { prisma } from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { googleClient, GOOGLE_CLIENT_ID } from '../config/google';
import { BadRequestError } from '../utils/errors';

const router: Router = Router();

const generateToken = (user: { id: string; email: string; role: string }) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
};

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/register", async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError(409, "Email sudah terdaftar");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const licenseKey = crypto.randomBytes(16).toString("hex");

    const user = await prisma.user.create({
      data: {
        email: data.email,
        businessName: data.businessName,
        password: hashedPassword,
        settings: {
          create: {
            licenseKey,
          },
        },
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        role: true,
        settings: {
          select: {
            licenseKey: true,
          },
        },
      },
    });

    const token = generateToken(user);

    // Set JWT token in HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      status: "success",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: {
        id: true,
        email: true,
        password: true,
        businessName: true,
        role: true,
        isGoogleUser: true,
        settings: {
          select: {
            licenseKey: true,
            licenseStatus: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError(401, "Email atau kata sandi tidak valid");
    }

    // Check if this is a Google user without password
    if (user.isGoogleUser && !user.password) {
      throw new AppError(401, "Silakan masuk menggunakan akun Google", { isGoogleUser: true });
    }

    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      throw new AppError(401, "Email atau kata sandi tidak valid");
    }

    if (user.settings?.licenseStatus === "SUSPENDED") {
      throw new AppError(403, "Lisensi Anda telah dinonaktifkan. Silakan hubungi admin.");
    }

    const token = generateToken(user);

    // Set JWT token in HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const { password, ...userWithoutPassword } = user;

    res.json({
      status: "success",
      data: {
        user: userWithoutPassword,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user.id },
      select: {
        id: true,
        email: true,
        businessName: true,
        businessLogo: true,
        settings: {
          select: {
            licenseKey: true,
            licenseStatus: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError(404, "Pengguna tidak ditemukan");
    }

    res.json({
      status: "success",
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({
    status: "success",
    message: "Logged out successfully",
  });
});

// Google OAuth endpoints
router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new BadRequestError('Token tidak valid atau data yang diperlukan tidak lengkap');
    }
    
    const { email } = payload;
    
    // Find or create user
    let user = await prisma.user.findUnique({ 
      where: { email },
      select: {
        id: true,
        email: true,
        businessName: true,
        role: true,
        settings: {
          select: {
            licenseKey: true,
          },
        },
      },
    });
    
    if (!user) {
      // Create new user with proper type annotations
      user = await prisma.user.create({
        data: {
          email: email,
          businessName: email.split('@')[0], // Use email prefix as business name
          password: '', // Empty password for Google users
          isActive: true,
          isGoogleUser: true,
          settings: {
            create: {
              licenseKey: `GOOGLE-${Date.now()}`,
              licenseStatus: 'ACTIVE'
            }
          }
        },
        select: {
          id: true,
          email: true,
          businessName: true,
          role: true,
          settings: {
            select: {
              licenseKey: true,
            },
          },
        },
      });
    }

    if (!user) {
      throw new BadRequestError('Gagal membuat atau mengambil data pengguna');
    }

    // Generate JWT token with proper type checking
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role
    };
    const token = generateToken(tokenPayload);

    res.json({
      status: 'success',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
