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
  user: Pick<User, "name" | "businessName" | "email" | "phone" | "address">;
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
      <title>Faktur #${number}</title>
      <style>
        body { 
          margin: 0; 
          padding: 0; 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.4;
          color: #2D3748;
          background-color: #F7FAFC;
        }
        table {
          border-collapse: collapse;
          width: 100%;
        }
        td {
          padding: 0;
        }
        .main-table {
          width: 100%;
          max-width: 600px;
          margin: 0 auto;
          background: white;
        }
        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #4A5568;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0;
          padding-bottom: 8px;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 500;
          color: white;
          background-color: ${statusColor};
        }
        .detail-label {
          font-size: 13px;
          color: #718096;
          padding-bottom: 2px;
        }
        .detail-value {
          font-size: 14px;
          color: #2D3748;
          padding-bottom: 8px;
        }
        .items-table th {
          background: #F8FAFC;
          padding: 8px;
          text-align: left;
          font-size: 13px;
          font-weight: 600;
          color: #4A5568;
          border-bottom: 1px solid #E2E8F0;
          border-top: 1px solid #E2E8F0;
        }
        .items-table td {
          padding: 8px;
          font-size: 13px;
          color: #4A5568;
          border-bottom: 1px solid #E2E8F0;
        }
        .amount-right {
          text-align: right;
        }
        .notes {
          background: #FFFAF0;
          padding: 12px;
          font-size: 13px;
          color: #744210;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <table class="main-table" cellpadding="0" cellspacing="0" border="0" align="center">
        <tr>
          <td style="padding: 24px;">
            <!-- Header -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding-bottom: 20px; border-bottom: 1px solid #E2E8F0;">
                  <div style="font-size: 22px; font-weight: bold; color: #1976D2;">FAKTURLY</div>
                  <div style="font-size: 13px; color: #718096;">Solusi Pencatatan Faktur & Reminder Pembayaran</div>
                </td>
              </tr>
            </table>

            <!-- Invoice Info -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
              <tr>
                <td style="background: #F8FAFC; padding: 16px; border-radius: 4px;">
                  <div style="font-size: 16px; font-weight: 600; color: #2D3748; margin-bottom: 8px;">Faktur #${number}</div>
                  <div class="status-badge">${statusText}</div>
                </td>
              </tr>
            </table>

            <!-- Business & Customer Info -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
              <tr>
                <td width="48%" valign="top">
                  <div class="section-title">Informasi Bisnis</div>
                  <div class="detail-label">Nama</div>
                  <div class="detail-value">${user.businessName || user.name}</div>
                  ${user.address ? `
                  <div class="detail-label">Alamat</div>
                  <div class="detail-value">${user.address}</div>
                  ` : ''}
                  ${user.phone ? `
                  <div class="detail-label">Telepon</div>
                  <div class="detail-value">${user.phone}</div>
                  ` : ''}
                </td>
                <td width="4%"></td>
                <td width="48%" valign="top">
                  <div class="section-title">Informasi Pelanggan</div>
                  <div class="detail-label">Nama</div>
                  <div class="detail-value">${customer.name}</div>
                  ${customer.address ? `
                  <div class="detail-label">Alamat</div>
                  <div class="detail-value">${customer.address}</div>
                  ` : ''}
                  ${customer.phone ? `
                  <div class="detail-label">Telepon</div>
                  <div class="detail-value">${customer.phone}</div>
                  ` : ''}
                </td>
              </tr>
            </table>

            <!-- Invoice Details -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
              <tr>
                <td>
                  <div class="section-title">Detail Faktur</div>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px;">
                    <tr>
                      <td width="48%">
                        <div class="detail-label">Tanggal Faktur</div>
                        <div class="detail-value">${formatDate(date)}</div>
                      </td>
                      <td width="4%"></td>
                      <td width="48%">
                        <div class="detail-label">Jatuh Tempo</div>
                        <div class="detail-value">${formatDate(dueDate)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Items -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
              <tr>
                <td>
                  <div class="section-title" style="margin-bottom: 8px;">Rincian Item</div>
                  <table width="100%" cellpadding="0" cellspacing="0" class="items-table">
                    <tr>
                      <th width="40%">Deskripsi</th>
                      <th width="20%">Jumlah</th>
                      <th width="20%">Harga</th>
                      <th width="20%" style="text-align: right;">Total</th>
                    </tr>
                    ${items.map(item => `
                    <tr>
                      <td>${item.description}</td>
                      <td>${item.quantity}</td>
                      <td>${formatRupiah(item.price)}</td>
                      <td style="text-align: right;">${formatRupiah(item.amount)}</td>
                    </tr>
                    `).join('')}
                  </table>

                  <!-- Totals -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px;">
                    <tr>
                      <td width="60%"></td>
                      <td width="40%">
                        <table width="100%" cellpadding="4" cellspacing="0" border="0">
                          <tr>
                            <td style="font-size: 13px;">Subtotal</td>
                            <td style="text-align: right; font-size: 13px;">${formatRupiah(subtotal)}</td>
                          </tr>
                          <tr>
                            <td style="font-size: 13px;">Pajak</td>
                            <td style="text-align: right; font-size: 13px;">${formatRupiah(tax)}</td>
                          </tr>
                          <tr>
                            <td style="font-size: 14px; font-weight: 600; padding-top: 8px; border-top: 1px solid #E2E8F0;">Total</td>
                            <td style="text-align: right; font-size: 14px; font-weight: 600; padding-top: 8px; border-top: 1px solid #E2E8F0;">${formatRupiah(total)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            ${notes ? `
            <!-- Notes -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
              <tr>
                <td class="notes">
                  <div class="section-title">Catatan</div>
                  ${notes}
                </td>
              </tr>
            </table>
            ` : ''}

            ${status === "PAID" && paymentProof ? `
            <!-- Payment Proof -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
              <tr>
                <td>
                  <div class="section-title">Bukti Pembayaran</div>
                  <img src="${paymentProof}" alt="Bukti Pembayaran" style="max-width: 100%; border-radius: 4px; margin-top: 8px;">
                </td>
              </tr>
            </table>
            ` : ''}

            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E2E8F0;">
              <tr>
                <td align="center" style="font-size: 13px; color: #718096;">
                  Email ini dibuat otomatis oleh sistem Fakturly.
                  ${status !== "PAID" ? `<br>Harap melakukan pembayaran sebelum ${formatDate(dueDate)}.` : ''}
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
    from: `"${user.businessName || user.name}" <${process.env.SMTP_USER}>`,
    to: customer.email,
    subject: `Faktur #${number} ${status === 'PAID' ? '(LUNAS)' : ''}`,
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
    const businessName = invoice.user.businessName || invoice.user.name;
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
          <h1 style="font-size: 24px; font-weight: 600; color: #1976d2; margin: 0 0 32px 0;">
            Pengingat Pembayaran: Faktur ${invoice.number}
          </h1>
          
          <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0;">
            Yth. ${invoice.customer.name},
          </p>
          
          <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0;">
            Ini adalah pengingat bahwa pembayaran untuk faktur ${
        invoice.number
            } 
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
            Email ini dikirim oleh ${user.businessName || user.name}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"${user.businessName || user.name}" <${process.env.SMTP_USER}>`,
    to: customer.email!,
    subject: `Bukti Pembayaran: Faktur ${invoiceNumber}`,
    html,
  });
}
