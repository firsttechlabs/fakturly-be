import { Payment, PaymentStatus } from "@prisma/client";
// @ts-ignore
import midtransClient from "midtrans-client";
import { BadRequestError } from "../utils/errors";
import { prisma } from "../utils/prisma";
import crypto from "crypto";

interface MidtransPaymentParams {
  orderId: string;
  amount: number;
  userId: string;
}

interface MidtransNotification {
  transaction_status: string;
  order_id: string;
  fraud_status?: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}

interface PricingInfo {
  originalPrice: number;
  discountedPrice: number;
  promoCode: string | null;
  promoDescription: string | null;
}

// Update user select in payment service
const userSelect = {
  id: true,
  email: true,
  businessName: true,
  businessEmail: true,
  businessPhone: true,
  businessAddress: true,
  businessLogo: true,
  role: true,
};

export class PaymentService {
  private snap: midtransClient.Snap;
  private coreApi: midtransClient.CoreApi;
  private readonly LICENSE_PRICE: number;
  private readonly serverKey: string;

  constructor() {
    this.serverKey = process.env.MIDTRANS_SERVER_KEY!;
    this.snap = new midtransClient.Snap({
      isProduction: process.env.NODE_ENV === "production",
      serverKey: this.serverKey,
      clientKey: process.env.MIDTRANS_CLIENT_KEY!,
    });

    this.coreApi = new midtransClient.CoreApi({
      isProduction: process.env.NODE_ENV === "production",
      serverKey: this.serverKey,
      clientKey: process.env.MIDTRANS_CLIENT_KEY!,
    });

    this.LICENSE_PRICE = Number(process.env.LICENSE_PRICE_IDR) || 500000;
  }

  private verifySignatureKey(notification: MidtransNotification): boolean {
    const expectedSignature = crypto
      .createHash("sha512")
      .update(
        `${notification.order_id}${notification.status_code}${notification.gross_amount}${this.serverKey}`
      )
      .digest("hex");

    return notification.signature_key === expectedSignature;
  }

  async getPricingInfo(promoCode?: string): Promise<PricingInfo> {
    // Default pricing without promo
    let discountedPrice = this.LICENSE_PRICE;
    let promoDescription = null;
    let validPromoCode = null;

    // Only process promo if one is provided
    if (promoCode?.trim()) {
      const promo = await prisma.promoCode.findUnique({
        where: {
          code: promoCode,
          isActive: true,
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      });

      if (!promo) {
        throw new BadRequestError(
          "Kode promo tidak valid atau sudah kadaluarsa"
        );
      }

      const promoUsage = await prisma.payment.count({
        where: {
          promoCode: promo.code,
          status: "SUCCESS",
        },
      });

      if (promoUsage >= promo.maxUses) {
        throw new BadRequestError("Kuota promo sudah habis");
      }

      // Calculate discounted price
      if (promo.discountType === "PERCENTAGE") {
        discountedPrice = this.LICENSE_PRICE * (1 - promo.discountValue / 100);
      } else {
        discountedPrice = this.LICENSE_PRICE - promo.discountValue;
      }
      discountedPrice = Math.max(0, discountedPrice); // Ensure price doesn't go negative

      const remainingSlots = promo.maxUses - promoUsage;
      promoDescription =
        promo.discountValue === 100
          ? `Selamat! Anda mendapatkan akses GRATIS (tersisa ${remainingSlots} slot)`
          : `${promo.description} (tersisa ${remainingSlots} slot)`;
      validPromoCode = promo.code;
    }

    return {
      originalPrice: this.LICENSE_PRICE,
      discountedPrice,
      promoCode: validPromoCode,
      promoDescription,
    };
  }

  async calculateFinalPrice(promoCode?: string | null): Promise<number> {
    // If no promo code provided, return original price
    if (!promoCode?.trim()) {
      return this.LICENSE_PRICE;
    }

    const { discountedPrice } = await this.getPricingInfo(promoCode);
    return discountedPrice;
  }

  async createMidtransPayment(params: MidtransPaymentParams) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: userSelect,
    });

    if (!user) {
      throw new BadRequestError("User not found");
    }

    const transaction = await this.snap.createTransaction({
      transaction_details: {
        order_id: params.orderId,
        gross_amount: params.amount,
      },
      customer_details: {
        first_name: user.businessName,
        email: user.businessEmail || user.email,
      },
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/dashboard`,
        error: `${process.env.FRONTEND_URL}/payment/${params.orderId}`,
        pending: `${process.env.FRONTEND_URL}/payment/${params.orderId}`,
      },
    });

    return transaction;
  }

  async handleNotification(
    notification: MidtransNotification
  ): Promise<Payment> {
    // Verify signature key
    if (!this.verifySignatureKey(notification)) {
      throw new BadRequestError("Invalid signature key");
    }

    const orderId = notification.order_id;
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    // Double check payment status via Midtrans API
    try {
      const transactionData = await this.coreApi.transaction.status(orderId);
      // Verify transaction data matches notification
      if (transactionData.transaction_status !== transactionStatus) {
        throw new BadRequestError("Transaction status mismatch");
      }
    } catch (error) {
      console.error("Error verifying transaction status:", error);
      throw new BadRequestError("Failed to verify transaction status");
    }

    const payment = await prisma.payment.findUnique({
      where: { midtransId: orderId },
      include: { user: true },
    });

    if (!payment) {
      throw new BadRequestError("Payment not found");
    }

    let paymentStatus: PaymentStatus;

    // Handle various transaction statuses
    switch (transactionStatus) {
      case "capture":
        paymentStatus =
          fraudStatus === "challenge"
            ? "PENDING"
            : fraudStatus === "accept"
            ? "SUCCESS"
            : "FAILED";
        break;
      case "settlement":
        paymentStatus = "SUCCESS";
        break;
      case "pending":
        paymentStatus = "PENDING";
        break;
      case "deny":
      case "cancel":
      case "expire":
      case "failure":
        paymentStatus = "FAILED";
        break;
      default:
        paymentStatus = "FAILED";
    }

    // Update payment status in database
    const updatedPayment = await prisma.payment.update({
      where: { midtransId: orderId },
      data: { status: paymentStatus },
    });

    // If payment is successful, activate user's account
    if (paymentStatus === "SUCCESS") {
      await prisma.user.update({
        where: { id: payment.userId },
        data: { isActive: true },
      });

      // If payment used a promo code, increment the usage count
      if (payment.promoCode) {
        await prisma.promoCode.update({
          where: { code: payment.promoCode },
          data: { currentUses: { increment: 1 } },
        });
      }
    }

    return updatedPayment;
  }

  async getPaymentStatus(userId: string): Promise<boolean> {
    const payment = await prisma.payment.findFirst({
      where: {
        userId,
        status: "SUCCESS",
      },
    });

    return !!payment;
  }

  async getRemainingPromoSlots(
    code: string
  ): Promise<{ remainingSlots: number; totalSlots: number }> {
    const promo = await prisma.promoCode.findUnique({
      where: {
        code,
        isActive: true,
      },
    });

    if (!promo) {
      throw new BadRequestError("Kode promo tidak ditemukan");
    }

    // Calculate remaining slots based on successful payments with this promo code
    const usedSlots = await prisma.payment.count({
      where: {
        promoCode: code,
        status: "SUCCESS",
      },
    });

    return {
      remainingSlots: Math.max(0, promo.maxUses - usedSlots),
      totalSlots: promo.maxUses,
    };
  }
}

// Update payment processing function
export async function processPayment(invoiceId: string, paymentData: any) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      user: {
        select: userSelect,
      },
      customer: true,
    },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  // Use businessName instead of name
  const merchantName = invoice.user.businessName;

  // Rest of the payment processing logic...
  // ... existing code ...
}
