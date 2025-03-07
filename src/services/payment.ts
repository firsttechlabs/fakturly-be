import { Payment, PaymentStatus } from '@prisma/client';
// @ts-ignore
import midtransClient from "midtrans-client";
import { BadRequestError } from '../utils/errors';
import { prisma } from '../utils/prisma';

interface MidtransPaymentParams {
  orderId: string;
  amount: number;
  userId: string;
}

interface MidtransNotification {
  transaction_status: string;
  order_id: string;
  fraud_status?: string;
}

interface PricingInfo {
  originalPrice: number;
  discountedPrice: number;
  promoCode: string | null;
  promoDescription: string | null;
}

export class PaymentService {
  private snap: midtransClient.Snap;
  private readonly LICENSE_PRICE: number;

  constructor() {
    this.snap = new midtransClient.Snap({
      isProduction: process.env.NODE_ENV === 'production',
      serverKey: process.env.MIDTRANS_SERVER_KEY!,
      clientKey: process.env.MIDTRANS_CLIENT_KEY!,
    });
    
    // Get license price from environment variable with fallback
    this.LICENSE_PRICE = Number(process.env.LICENSE_PRICE_IDR) || 500000;
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
        throw new BadRequestError("Kode promo tidak valid atau sudah kadaluarsa");
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
      promoDescription = promo.discountValue === 100
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
      select: { name: true, email: true },
    });

    if (!user) {
      throw new BadRequestError('User not found');
    }

    const transaction = await this.snap.createTransaction({
      transaction_details: {
        order_id: params.orderId,
        gross_amount: params.amount,
      },
      customer_details: {
        first_name: user.name,
        email: user.email,
      },
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/dashboard`,
        error: `${process.env.FRONTEND_URL}/payment/${params.orderId}`,
        pending: `${process.env.FRONTEND_URL}/payment/${params.orderId}`,
      }
    });

    return transaction;
  }

  async handleNotification(notification: MidtransNotification): Promise<Payment> {
    const orderId = notification.order_id;
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    const payment = await prisma.payment.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!payment) {
      throw new BadRequestError('Payment not found');
    }

    let paymentStatus: PaymentStatus;

    if (transactionStatus == 'capture') {
      if (fraudStatus == 'challenge') {
        paymentStatus = 'PENDING';
      } else if (fraudStatus == 'accept') {
        paymentStatus = 'SUCCESS';
      } else {
        paymentStatus = 'FAILED';
      }
    } else if (transactionStatus == 'settlement') {
      paymentStatus = 'SUCCESS';
    } else if (transactionStatus == 'cancel' || transactionStatus == 'deny' || transactionStatus == 'expire') {
      paymentStatus = 'FAILED';
    } else if (transactionStatus == 'pending') {
      paymentStatus = 'PENDING';
    } else {
      paymentStatus = 'FAILED';
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: orderId },
      data: { status: paymentStatus },
    });

    // If payment is successful, activate the user
    if (paymentStatus === 'SUCCESS') {
      await prisma.user.update({
        where: { id: payment.userId },
        data: { isActive: true },
      });
    }

    return updatedPayment;
  }

  async getPaymentStatus(userId: string): Promise<boolean> {
    const payment = await prisma.payment.findFirst({
      where: {
        userId,
        status: 'SUCCESS',
      },
    });

    return !!payment;
  }

  async getRemainingPromoSlots(code: string): Promise<{ remainingSlots: number; totalSlots: number }> {
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
      totalSlots: promo.maxUses
    };
  }
}