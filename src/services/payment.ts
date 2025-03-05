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

export class PaymentService {
  private snap: midtransClient.Snap;

  constructor() {
    this.snap = new midtransClient.Snap({
      isProduction: process.env.NODE_ENV === 'production',
      serverKey: process.env.MIDTRANS_SERVER_KEY!,
      clientKey: process.env.MIDTRANS_CLIENT_KEY!,
    });
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
        finish: `${process.env.FRONTEND_URL}/payment/finish`,
      },
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
} 