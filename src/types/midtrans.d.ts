declare module 'midtrans-client' {
  export class Snap {
    constructor(options: {
      isProduction: boolean;
      serverKey: string;
      clientKey: string;
    });

    createTransaction(params: {
      transaction_details: {
        order_id: string;
        gross_amount: number;
      };
      customer_details?: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
      };
      callbacks?: {
        finish?: string;
        error?: string;
        pending?: string;
      };
    }): Promise<{
      token: string;
      redirect_url: string;
    }>;
  }

  export class CoreApi {
    constructor(options: {
      isProduction: boolean;
      serverKey: string;
      clientKey: string;
    });

    charge(params: {
      payment_type: string;
      transaction_details: {
        order_id: string;
        gross_amount: number;
      };
      customer_details?: {
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
      };
    }): Promise<any>;

    transaction: {
      status(orderId: string): Promise<any>;
      notification(notificationJson: any): Promise<any>;
    };
  }
}