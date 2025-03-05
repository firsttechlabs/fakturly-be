import nodemailer from 'nodemailer';
import { Invoice, InvoiceItem, User, Customer } from '@prisma/client';
import { formatCurrency } from './format';
import { logger } from './logger';

type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
  user: Pick<User, 'name' | 'businessName' | 'email'>;
  customer: Customer;
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendInvoiceEmail(invoice: InvoiceWithItems): Promise<void> {
  const {
    number: invoiceNumber,
    date,
    dueDate,
    items,
    subtotal,
    tax: taxAmount,
    total,
    notes,
    user,
    customer,
  } = invoice;

  const itemsHtml = items
    .map(
      (item, index) => `
      <tr style="${index % 2 === 0 ? '' : 'background-color: #fafafa;'}">
        <td style="padding: 16px; border-bottom: 1px solid #eee;">${item.description}</td>
        <td style="padding: 16px; border-bottom: 1px solid #eee; text-align: right;">${item.quantity}</td>
        <td style="padding: 16px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price)}</td>
        <td style="padding: 16px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price * item.quantity)}</td>
      </tr>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Faktur ${invoiceNumber}</title>
      <style>
        body { margin: 0; padding: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
      </style>
    </head>
    <body>
      <div style="max-width: 800px; margin: 0 auto; padding: 40px 24px; background: white;">
        <!-- Header -->
        <div style="margin-bottom: 40px;">
          <h1 style="font-size: 24px; font-weight: 600; color: #1a1a1a; margin: 0;">
            Faktur ${invoiceNumber}
          </h1>
        </div>

        <!-- Info Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 40px;">
          <!-- Customer Details -->
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px;">
            <h2 style="font-size: 16px; font-weight: 600; color: #00796b; margin: 0 0 16px 0;">
              Detail Pelanggan
            </h2>
            <p style="font-size: 16px; font-weight: 500; color: #1a1a1a; margin: 0 0 8px 0;">
              ${customer.name}
            </p>
            ${customer.email ? 
              `<p style="font-size: 14px; color: #666; margin: 4px 0;">
                ${customer.email}
              </p>` : ''}
            ${customer.phone ? 
              `<p style="font-size: 14px; color: #666; margin: 4px 0;">
                ${customer.phone}
              </p>` : ''}
          </div>

          <!-- Invoice Details -->
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px;">
            <h2 style="font-size: 16px; font-weight: 600; color: #00796b; margin: 0 0 16px 0;">
              Detail Faktur
            </h2>
            <p style="font-size: 14px; color: #666; margin: 8px 0;">
              Tanggal: ${new Date(date).toLocaleDateString('id-ID', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </p>
            <p style="font-size: 14px; color: #666; margin: 8px 0;">
              Jatuh Tempo: ${new Date(dueDate).toLocaleDateString('id-ID', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </p>
          </div>
        </div>

        <!-- Items Table -->
        <div style="margin-bottom: 40px; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; background-color: white;">
            <thead>
              <tr style="background-color: #f8f9fa;">
                <th style="padding: 16px; text-align: left; font-weight: 600; color: #1a1a1a; border-bottom: 2px solid #eee;">
                  Deskripsi
                </th>
                <th style="padding: 16px; text-align: right; font-weight: 600; color: #1a1a1a; border-bottom: 2px solid #eee;">
                  Jumlah
                </th>
                <th style="padding: 16px; text-align: right; font-weight: 600; color: #1a1a1a; border-bottom: 2px solid #eee;">
                  Harga Satuan
                </th>
                <th style="padding: 16px; text-align: right; font-weight: 600; color: #1a1a1a; border-bottom: 2px solid #eee;">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>

        <!-- Totals -->
        <div style="margin-left: auto; width: 300px; margin-bottom: 40px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #666;">Subtotal:</span>
            <span style="color: #666;">${formatCurrency(subtotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #666;">Pajak:</span>
            <span style="color: #666;">${formatCurrency(taxAmount || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 2px solid #eee;">
            <span style="font-weight: 600; color: #00796b;">Total:</span>
            <span style="font-weight: 600; color: #00796b;">${formatCurrency(total)}</span>
          </div>
        </div>

        ${notes ? `
          <!-- Notes -->
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 40px;">
            <h2 style="font-size: 16px; font-weight: 600; color: #00796b; margin: 0 0 16px 0;">
              Catatan
            </h2>
            <p style="font-size: 14px; color: #666; margin: 0; white-space: pre-wrap;">
              ${notes}
            </p>
          </div>
        ` : ''}

        <!-- Footer -->
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
    from: `"${user.businessName || user.name}" <${user.email}>`,
    to: customer.email!,
    subject: `Faktur ${invoiceNumber} dari ${user.businessName || user.name}`,
    html,
  });
}

export const sendReminderEmail = async (invoice: InvoiceWithItems) => {
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
          <h1 style="font-size: 24px; font-weight: 600; color: #00796b; margin: 0 0 32px 0;">
            Pengingat Pembayaran: Faktur ${invoice.number}
          </h1>
          
          <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0;">
            Yth. ${invoice.customer.name},
          </p>
          
          <p style="font-size: 16px; color: #1a1a1a; margin: 16px 0;">
            Ini adalah pengingat bahwa pembayaran untuk faktur ${invoice.number} 
            ${daysOverdue > 0 ? `telah jatuh tempo ${daysOverdue} hari` : 'jatuh tempo hari ini'}.
          </p>
          
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin: 32px 0;">
            <p style="font-size: 16px; color: #1a1a1a; margin: 8px 0;">
              <strong>Total Tagihan:</strong> ${formatCurrency(invoice.total)}
            </p>
            <p style="font-size: 16px; color: #1a1a1a; margin: 8px 0;">
              <strong>Jatuh Tempo:</strong> ${invoice.dueDate.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
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
      from: `"${businessName}" <${invoice.user.email}>`,
      to: invoice.customer.email!,
      subject: `Pengingat Pembayaran: Faktur ${invoice.number}`,
      html,
    });

    logger.info(`Reminder email sent successfully to ${invoice.customer.email}`);
  } catch (error) {
    logger.error('Error sending reminder email:', error);
    throw error;
  }
}; 