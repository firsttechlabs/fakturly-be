import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { AppError } from "../middleware/errorHandler";
import { z } from "zod";
import { PaymentService } from "../services/payment";
// @ts-ignore
import rateLimit from "express-rate-limit";

const router = Router();
const paymentService = new PaymentService();

// Rate limit for pricing info - 100 requests per 15 minutes
const pricingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: "error", message: "Too many requests, please try again later" }
});

const createPaymentSchema = z.object({
  promoCode: z.string().nullable().optional(),
});

// Create payment
router.post("/create", authenticate, async (req: Request, res: Response, next: NextFunction) => {
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

    // Get final price (will be original price if no promo)
    const finalPrice = await paymentService.calculateFinalPrice(promoCode);

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount: finalPrice,
        status: finalPrice === 0 ? "SUCCESS" : "PENDING",
        promoCode: promoCode || null, // Ensure null if no promo
      },
    });

    // If price is 0 (free from promo), activate user immediately
    if (finalPrice === 0) {
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
    const midtransResponse = await paymentService.createMidtransPayment({
      orderId: payment.id,
      amount: finalPrice,
      userId,
    });

    // Update payment with Midtrans ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        midtransId: payment.id,
      },
    });

    // Return consistent response format
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
router.get("/pricing-info", [authenticate, pricingRateLimit], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promoCode = req.query.promoCode as string;
    const pricingInfo = await paymentService.getPricingInfo(promoCode);

    res.json({
      status: "success",
      data: pricingInfo,
    });
  } catch (error) {
    next(error);
  }
});

// Handle Midtrans notification
router.post("/notification", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentService.handleNotification(req.body);
    res.json({ status: "success", data: payment });
  } catch (error) {
    next(error);
  }
});

// Get payment status
router.get("/status", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hasValidPayment = await paymentService.getPaymentStatus(
      (req as any).user.id
    );
    res.json({ status: "success", data: { hasValidPayment } });
  } catch (error) {
    next(error);
  }
});

// Get remaining promo slots
router.get("/promo-slots/:code", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;
    const slots = await paymentService.getRemainingPromoSlots(code);

    res.json({
      status: "success",
      data: slots,
    });
  } catch (error) {
    next(error);
  }
});

export { router as paymentRouter };
