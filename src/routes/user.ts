import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import bcrypt from "bcryptjs";

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  businessName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

// Get user count
router.get("/count", async (req, res, next) => {
  try {
    const count = await prisma.user.count({
      where: {
        isActive: true,
      },
    });

    res.json({
      status: "success",
      data: { count },
    });
  } catch (error) {
    next(error);
  }
});

router.use(authenticate);

// Get user profile
router.get("/profile", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user.id },
      select: {
        id: true,
        email: true,
        name: true,
        businessName: true,
        address: true,
        phone: true,
        settings: {
          select: {
            invoicePrefix: true,
            taxRate: true,
            licenseKey: true,
            licenseStatus: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    res.json({
      status: "success",
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.patch("/profile", async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const data = updateProfileSchema.parse(req.body);

    // If password change is requested
    if (data.currentPassword && data.newPassword) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AppError(404, "User not found");
      }

      const validPassword = await bcrypt.compare(
        data.currentPassword,
        user.password
      );
      if (!validPassword) {
        throw new AppError(400, "Current password is incorrect");
      }

      const hashedPassword = await bcrypt.hash(data.newPassword, 10);

      // Remove password fields from data
      const { currentPassword, newPassword, ...updateData } = data;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...updateData,
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          name: true,
          businessName: true,
          address: true,
          phone: true,
        },
      });

      return res.json({
        status: "success",
        data: updatedUser,
      });
    }

    // Regular profile update without password change
    const { currentPassword, newPassword, ...updateData } = data;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        businessName: true,
        address: true,
        phone: true,
      },
    });

    res.json({
      status: "success",
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
});

// Get active user count
router.get("/active-count", async (req, res) => {
  try {
    const activeUserCount = await prisma.user.count({
      where: {
        isActive: true,
      },
    });

    return res.json({ count: activeUserCount });
  } catch (error) {
    console.error("Error getting active user count:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export const userRouter = router;
