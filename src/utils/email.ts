import nodemailer from "nodemailer";
import {
  Invoice,
  InvoiceItem,
  User,
  Customer,
  InvoiceStatus,
} from "@prisma/client";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { logger } from "./logger";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

export function formatDate(date: Date): string {
  return format(date, "dd MMMM yyyy", { locale: id });
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

function getStatusText(status: InvoiceStatus): string {
  const statusTexts: { [key in InvoiceStatus]: string } = {
    UNPAID: "Belum Dibayar",
    PAID: "Lunas",
    OVERDUE: "Jatuh Tempo",
    CANCELLED: "Dibatalkan",
  };
  return statusTexts[status];
}

function getStatusColor(status: InvoiceStatus): string {
  const colors: { [key in InvoiceStatus]: string } = {
    UNPAID: "#FFA726",
    PAID: "#66BB6A",
    OVERDUE: "#EF5350",
    CANCELLED: "#9E9E9E",
  };
  return colors[status];
}

type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
  user: Pick<User, "businessName" | "businessEmail" | "businessPhone" | "businessAddress" | "businessLogo">;
  customer: Customer;
};

export async function sendInvoiceEmail(
  invoice: InvoiceWithItems
): Promise<void> {
  const {
    number,
    date,
    dueDate,
    status,
    subtotal,
    tax,
    total,
    notes,
    paymentProof,
    user,
    customer,
    items,
  } = invoice;

  if (!customer.email) {
    logger.warn(
      `Cannot send invoice ${number} - customer has no email address`
    );
    throw new Error("Customer email is required to send invoice");
  }

  const statusText = getStatusText(status);
  const statusColor = getStatusColor(status);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${status === "PAID" ? "Kwitansi" : "Faktur"} #${number}</title>
      <style>
        body { 
          margin: 0; 
          padding: 0; 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.4;
          color: #0A2540;
          background-color: #F6F9FC;
        }
        .main-table {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .header {
          background: linear-gradient(45deg, #635BFF 30%, #7B75FF 90%);
          color: white;
          padding: 32px;
          text-align: center;
        }
        .header-logo {
          max-width: 200px;
          max-height: 80px;
          margin-bottom: 16px;
        }
        .header-title {
          font-size: 28px;
          font-weight: 600;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .content {
          padding: 32px;
        }
        .section {
          margin-bottom: 32px;
        }
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #635BFF;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 16px 0;
          padding-bottom: 8px;
          border-bottom: 2px solid #F6F9FC;
        }
        .info-grid {
          width: 100%;
          border-collapse: separate;
          border-spacing: 16px;
        }
        .info-cell {
          background: #F8FAFC;
          padding: 16px;
          border-radius: 12px;
          vertical-align: top;
        }
        .status-badge {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          color: white;
          background-color: ${statusColor};
        }
        .detail-label {
          font-size: 13px;
          color: #425466;
          margin-bottom: 4px;
        }
        .detail-value {
          font-size: 14px;
          color: #0A2540;
          margin-bottom: 12px;
          font-weight: 500;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        .items-table th {
          background: #F8FAFC;
          padding: 12px;
          text-align: left;
          font-size: 13px;
          font-weight: 600;
          color: #425466;
          border-bottom: 1px solid #E2E8F0;
          border-top: 1px solid #E2E8F0;
        }
        .items-table td {
          padding: 12px;
          font-size: 14px;
          color: #0A2540;
          border-bottom: 1px solid #E2E8F0;
        }
        .amount-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 8px;
          margin-top: 24px;
        }
        .amount-row td {
          padding: 8px 0;
          font-size: 14px;
        }
        .amount-label {
          color: #425466;
          text-align: right;
        }
        .amount-value {
          color: #0A2540;
          text-align: right;
          font-weight: 500;
          width: 35%;
        }
        .total-row td {
          padding-top: 16px;
          font-size: 16px;
          font-weight: 600;
          color: #635BFF;
        }
        .notes {
          background: #FFF8E7;
          padding: 16px;
          border-radius: 12px;
          margin-top: 32px;
        }
        .notes-title {
          font-size: 14px;
          font-weight: 600;
          color: #B7791F;
          margin: 0 0 8px 0;
        }
        .notes-content {
          font-size: 14px;
          color: #744210;
          margin: 0;
        }
        .footer {
          text-align: center;
          padding: 32px;
          background: #F8FAFC;
          color: #425466;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <table class="main-table" cellpadding="0" cellspacing="0" border="0" align="center">
        <tr>
          <td>
            <!-- Header -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="header">
                  ${user.businessLogo ? `
                    <img src="${user.businessLogo}" alt="${user.businessName}" class="header-logo">
                  ` : ''}
                  <h1 class="header-title">${status === "PAID" ? "Kwitansi" : "Faktur"} #${number}</h1>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="content">
                  <!-- Status -->
                  <div class="section">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center">
                          <div class="status-badge">${statusText}</div>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- Business & Customer Info -->
                  <div class="section">
                    <table class="info-grid">
                      <tr>
                        <td class="info-cell" width="50%">
                          <div class="section-title">Informasi Bisnis</div>
                          <div class="detail-label">Nama Usaha</div>
                          <div class="detail-value">${user.businessName}</div>
                          ${user.businessEmail ? `
                            <div class="detail-label">Email</div>
                            <div class="detail-value">${user.businessEmail}</div>
                          ` : ''}
                          ${user.businessPhone ? `
                            <div class="detail-label">Telepon</div>
                            <div class="detail-value">${user.businessPhone}</div>
                          ` : ''}
                          ${user.businessAddress ? `
                            <div class="detail-label">Alamat</div>
                            <div class="detail-value">${user.businessAddress}</div>
                          ` : ''}
                        </td>
                        <td class="info-cell" width="50%">
                          <div class="section-title">Informasi Pelanggan</div>
                          <div class="detail-label">Nama</div>
                          <div class="detail-value">${customer.name}</div>
                          ${customer.email ? `
                            <div class="detail-label">Email</div>
                            <div class="detail-value">${customer.email}</div>
                          ` : ''}
                          ${customer.phone ? `
                            <div class="detail-label">Telepon</div>
                            <div class="detail-value">${customer.phone}</div>
                          ` : ''}
                          ${customer.address ? `
                            <div class="detail-label">Alamat</div>
                            <div class="detail-value">${customer.address}</div>
                          ` : ''}
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- Invoice Details -->
                  <div class="section">
                    <div class="section-title">Detail ${status === "PAID" ? "Kwitansi" : "Faktur"}</div>
                    <table class="info-grid">
                      <tr>
                        <td class="info-cell" width="50%">
                          <div class="detail-label">Tanggal</div>
                          <div class="detail-value">${formatDate(date)}</div>
                        </td>
                        <td class="info-cell" width="50%">
                          <div class="detail-label">Jatuh Tempo</div>
                          <div class="detail-value">${formatDate(dueDate)}</div>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- Items -->
                  <div class="section">
                    <div class="section-title">Rincian Item</div>
                    <table class="items-table">
                      <thead>
                        <tr>
                          <th width="45%">Deskripsi</th>
                          <th width="15%">Jumlah</th>
                          <th width="20%">Harga</th>
                          <th width="20%" style="text-align: right;">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${items.map(item => `
                          <tr>
                            <td>${item.description}</td>
                            <td>${item.quantity}</td>
                            <td>${formatRupiah(item.price)}</td>
                            <td style="text-align: right;">${formatRupiah(item.amount)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>

                    <!-- Totals -->
                    <table class="amount-table">
                      <tr class="amount-row">
                        <td class="amount-label">Subtotal</td>
                        <td class="amount-value">${formatRupiah(subtotal)}</td>
                      </tr>
                      <tr class="amount-row">
                        <td class="amount-label">Pajak</td>
                        <td class="amount-value">${formatRupiah(tax)}</td>
                      </tr>
                      <tr class="amount-row total-row">
                        <td class="amount-label">Total</td>
                        <td class="amount-value">${formatRupiah(total)}</td>
                      </tr>
                    </table>
                  </div>

                  ${notes ? `
                    <!-- Notes -->
                    <div class="notes">
                      <div class="notes-title">Catatan</div>
                      <p class="notes-content">${notes}</p>
                    </div>
                  ` : ''}

                  ${status === "PAID" && paymentProof ? `
                    <!-- Payment Proof -->
                    <div class="section">
                      <div class="section-title">Bukti Pembayaran</div>
                      <img src="${paymentProof}" alt="Bukti Pembayaran" style="max-width: 100%; border-radius: 12px; margin-top: 8px;">
                    </div>
                  ` : ''}
                </td>
              </tr>
            </table>

            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="footer">
                  <p style="margin: 0;">
                    ${status === "PAID" 
                      ? "Terima kasih atas pembayaran Anda. Ini adalah bukti pembayaran resmi dari transaksi yang telah dilakukan." 
                      : `Harap melakukan pembayaran sebelum ${formatDate(dueDate)}.`}
                  </p>
                  <p style="margin: 8px 0 0 0;">
                    Dokumen ini dibuat secara otomatis oleh sistem Fakturly
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"${user.businessName}" <${process.env.SMTP_USER}>`,
    to: customer.email,
    subject: `${status === 'PAID' ? '(LUNAS)' : ''} Faktur #${number}`,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Invoice ${number} sent to ${customer.email}`);
  } catch (error) {
    logger.error('Error sending invoice email:', error);
    throw error;
  }
}

export async function sendReminderEmail(
  invoice: InvoiceWithItems
): Promise<void> {
  try {
    const businessName = invoice.user.businessName || invoice.user.businessName;
    const daysOverdue = Math.floor(
      (new Date().getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pengingat Pembayaran: Faktur ${invoice.number}</title>
        <style>
          body { margin: 0; padding: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
        </style>
      </head>
      <body>
        <div style="max-width: 800px; margin: 0 auto; padding: 40px 24px; background: white;">
          ${invoice.user.businessLogo ? `
            <div style="text-align: center; margin-bottom: 24px;">
              <img src="${invoice.user.businessLogo}" alt="${businessName}" style="max-width: 200px; max-height: 80px;">
            </div>
          ` : ''}
          
          <h1 style="font-size: 24px; font-weight: 600; color: #1976d2; margin: 0 0 32px 0;">
            Pengingat Pembayaran: Faktur ${invoice.number}
          </h1>
          
          <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0;">
            Yth. ${invoice.customer.name},
          </p>
          
          <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0;">
            Ini adalah pengingat bahwa pembayaran untuk faktur ${invoice.number} 
            ${
              daysOverdue > 0
                ? `telah jatuh tempo ${daysOverdue} hari`
                : "jatuh tempo hari ini"
            }.
          </p>
          
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin: 32px 0;">
            <p style="font-size: 16px; color: #1a1a1a; margin: 8px 0;">
              <strong>Total Tagihan:</strong> Rp ${formatRupiah(invoice.total)}
            </p>
            <p style="font-size: 16px; color: #1a1a1a; margin: 8px 0;">
              <strong>Jatuh Tempo:</strong> ${formatDate(invoice.dueDate)}
            </p>
          </div>
          
          <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0;">
            Mohon segera proses pembayaran Anda.
          </p>
          
          <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0;">
            Hormat kami,<br>
            ${businessName}
          </p>

          <div style="text-align: center; padding-top: 40px; border-top: 1px solid #eee; margin-top: 40px;">
            <p style="font-size: 14px; color: #666; margin: 0;">
              Email ini dikirim oleh ${businessName}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"${businessName}" <${process.env.SMTP_USER}>`,
      to: invoice.customer.email!,
      subject: `Pengingat Pembayaran: Faktur ${invoice.number}`,
      html,
    });

    logger.info(
      `Reminder email sent successfully to ${invoice.customer.email}`
    );
  } catch (error) {
    logger.error("Error sending reminder email:", error);
    throw error;
  }
}

export async function sendPaymentProofEmail(
  invoice: InvoiceWithItems
): Promise<void> {
  const {
    number: invoiceNumber,
    date,
    paymentProof,
    total,
    user,
    customer,
    notes,
  } = invoice;

  if (!paymentProof) {
    throw new Error("No payment proof available");
  }

  const businessName = user.businessName || user.businessName;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bukti Pembayaran Faktur ${invoiceNumber}</title>
      <style>
        body { margin: 0; padding: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
      </style>
    </head>
    <body>
      <div style="max-width: 800px; margin: 0 auto; padding: 40px 24px; background: white;">
        ${user.businessLogo ? `
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${user.businessLogo}" alt="${businessName}" style="max-width: 200px; max-height: 80px;">
          </div>
        ` : ''}

        <h1 style="font-size: 24px; font-weight: 600; color: #1a1a1a; margin: 0 0 32px 0;">
          Bukti Pembayaran: Faktur ${invoiceNumber}
        </h1>

        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
          <p style="font-size: 16px; color: #1a1a1a; margin: 8px 0;">
            <strong>Total Pembayaran:</strong> Rp ${formatRupiah(total)}
          </p>
          <p style="font-size: 16px; color: #1a1a1a; margin: 8px 0;">
            <strong>Tanggal Pembayaran:</strong> ${formatDate(date)}
          </p>
          ${
            notes
              ? `
            <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0 8px 0;">
              <strong>Catatan Pembayaran:</strong>
            </p>
            <p style="font-size: 14px; color: #666; margin: 0;">
              ${notes}
            </p>
          `
              : ""
          }
        </div>

        <div style="margin-bottom: 32px;">
          <p style="font-size: 16px; color: #1a1a1a; margin: 0 0 16px 0;">
            <strong>Bukti Pembayaran:</strong>
          </p>
          <img src="${paymentProof}" alt="Bukti Pembayaran" style="max-width: 100%; border-radius: 8px;">
        </div>

        <div style="text-align: center; padding-top: 40px; border-top: 1px solid #eee;">
          <p style="font-size: 14px; color: #666; margin: 0;">
            Email ini dikirim oleh ${businessName}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"${businessName}" <${process.env.SMTP_USER}>`,
    to: customer.email!,
    subject: `Bukti Pembayaran: Faktur ${invoiceNumber}`,
    html,
  });
}
