import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { AppError } from "../middleware/errorHandler";
import { z } from "zod";
import { PaymentService } from "../services/payment";

const router = Router();
const paymentService = new PaymentService();

const createPaymentSchema = z.object({
  promoCode: z.string().optional(),
});

// Create payment
router.post("/create", authenticate, async (req, res, next) => {
  try {
    const { promoCode } = createPaymentSchema.parse(req.body);
    const userId = (req as any).user.id;

    // Check if user already has a successful payment
    const existingPayment = await prisma.payment.findFirst({
      where: {
        userId,
        status: "SUCCESS",
      },
    });

    if (existingPayment) {
      throw new AppError(400, "User already has an active payment");
    }

    const LICENSE_PRICE = Number(process.env.LICENSE_PRICE_IDR) || 500000;
    let finalPrice = LICENSE_PRICE;

    // Check promo code if provided
    if (promoCode) {
      const promoDetails = await prisma.promoCode.findUnique({
        where: {
          code: promoCode,
          isActive: true,
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      });

      if (!promoDetails) {
        throw new AppError(400, "Invalid or expired promo code");
      }

      // Check promo usage
      const promoUsage = await prisma.payment.count({
        where: {
          promoCode: promoCode,
          status: "SUCCESS",
        },
      });

      if (promoUsage >= promoDetails.maxUses) {
        throw new AppError(400, "Promo code quota exceeded");
      }

      // Calculate final price after discount
      if (promoDetails.discountType === "PERCENTAGE") {
        finalPrice = LICENSE_PRICE * (1 - promoDetails.discountValue / 100);
      } else {
        finalPrice = LICENSE_PRICE - promoDetails.discountValue;
      }
      finalPrice = Math.max(0, finalPrice); // Ensure price doesn't go negative
    }

    // If price is 0 (free from promo), create successful payment directly
    if (finalPrice === 0) {
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount: 0,
          status: "SUCCESS",
          promoCode,
        },
      });

      // Activate user
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: true },
      });

      return res.json({
        status: "success",
        data: {
          payment,
          redirectUrl: "/dashboard",
        },
      });
    }

    // For paid transactions, create Midtrans payment
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount: finalPrice,
        status: "PENDING",
        promoCode,
      },
    });

    const midtransResponse = await paymentService.createMidtransPayment({
      orderId: payment.id,
      amount: finalPrice,
      userId,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        midtransId: midtransResponse.token,
        paymentUrl: midtransResponse.redirect_url,
      },
    });

    res.json({
      status: "success",
      data: {
        payment,
        redirectUrl: midtransResponse.redirect_url,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get pricing info
router.get("/pricing-info", authenticate, async (req, res, next) => {
  try {
    const promoCode = req.query.promoCode as string;
    const LICENSE_PRICE = Number(process.env.LICENSE_PRICE_IDR) || 500000;

    let discountedPrice = LICENSE_PRICE;
    let promoDescription = null;
    let validPromoCode = null;

    if (promoCode) {
      const promo = await prisma.promoCode.findUnique({
        where: {
          code: promoCode,
          isActive: true,
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      });

      if (!promo) {
        throw new AppError(400, "Kode promo tidak valid atau sudah kadaluarsa");
      }

      const promoUsage = await prisma.payment.count({
        where: {
          promoCode: promo.code,
          status: "SUCCESS",
        },
      });

      if (promoUsage >= promo.maxUses) {
        throw new AppError(400, "Kuota promo sudah habis");
      }

      // Calculate discounted price
      if (promo.discountType === "PERCENTAGE") {
        discountedPrice = LICENSE_PRICE * (1 - promo.discountValue / 100);
      } else {
        discountedPrice = LICENSE_PRICE - promo.discountValue;
      }
      discountedPrice = Math.max(0, discountedPrice); // Ensure price doesn't go negative

      const remainingSlots = promo.maxUses - promoUsage;
      promoDescription = promo.discountValue === 100 
        ? `Selamat! Anda mendapatkan akses GRATIS (tersisa ${remainingSlots} slot)`
        : `${promo.description} (tersisa ${remainingSlots} slot)`;
      validPromoCode = promo.code;
    }

    res.json({
      status: "success",
      data: {
        originalPrice: LICENSE_PRICE,
        discountedPrice,
        promoCode: validPromoCode,
        promoDescription,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Handle Midtrans notification
router.post("/notification", async (req, res) => {
  const payment = await paymentService.handleNotification(req.body);
  res.json({ status: "success", data: payment });
});

// Get payment status
router.get("/status", authenticate, async (req, res) => {
  const hasValidPayment = await paymentService.getPaymentStatus(
    (req as any).user.id
  );
  res.json({ status: "success", data: { hasValidPayment } });
});

export { router as paymentRouter };
