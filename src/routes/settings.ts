import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const updateSettingsSchema = z.object({
  invoicePrefix: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional(),
});

router.get("/", authenticate, async (req, res) => {
  try {
    const settings = await prisma.settings.findUnique({
      where: { userId: (req as any).user.id },
    });

    if (!settings) {
      throw new AppError(404, "Pengaturan tidak ditemukan");
    }

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan internal" });
  }
});

router.patch("/", authenticate, async (req, res) => {
  try {
    const data = updateSettingsSchema.parse(req.body);

    const settings = await prisma.settings.update({
      where: { userId: (req as any).user.id },
      data,
    });

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: "Input tidak valid", errors: error.errors });
    } else {
      console.error("Error updating settings:", error);
      res.status(500).json({ success: false, message: "Terjadi kesalahan internal" });
    }
  }
});

// Get license status
router.get("/license", authenticate, async (req, res, next) => {
  try {
    const settings = await prisma.settings.findUnique({
      where: { userId: (req as any).user.id },
      select: {
        licenseKey: true,
        licenseStatus: true,
      },
    });

    if (!settings) {
      throw new AppError(404, "Pengaturan tidak ditemukan");
    }

    res.json({
      success: true,
      data: {
        licenseKey: settings.licenseKey,
        licenseStatus: settings.licenseStatus,
        price: Number(process.env.LICENSE_PRICE_IDR),
      },
    });
  } catch (error) {
    next(error);
  }
});

export const settingRouter = router; 