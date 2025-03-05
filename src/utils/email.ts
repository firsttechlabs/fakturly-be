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
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${item.description}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price * item.quantity)}</td>
      </tr>
    `
    )
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <div style="background-color: #f8f9fa; padding: 20px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #333;">${user.businessName || user.name}</h2>
        <p style="margin: 5px 0; color: #666;">${user.email}</p>
      </div>

      <div style="margin-bottom: 40px;">
        <h1 style="color: #333;">Invoice ${invoiceNumber}</h1>
        <p style="color: #666;">Due Date: ${new Date(dueDate).toLocaleDateString()}</p>
      </div>

      <div style="margin-bottom: 40px;">
        <h3 style="color: #333;">Bill To:</h3>
        <p style="margin: 5px 0;">${customer.name}</p>
        <p style="margin: 5px 0;">${customer.email}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 12px; text-align: left;">Description</th>
            <th style="padding: 12px; text-align: right;">Quantity</th>
            <th style="padding: 12px; text-align: right;">Unit Price</th>
            <th style="padding: 12px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="margin-left: auto; width: 300px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span>Subtotal:</span>
          <span>${formatCurrency(subtotal)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span>Tax:</span>
          <span>${formatCurrency(taxAmount || 0)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2em;">
          <span>Total:</span>
          <span>${formatCurrency(total)}</span>
        </div>
      </div>

      ${notes ? `<div style="margin-top: 40px; color: #666;"><h3>Notes:</h3><p>${notes}</p></div>` : ''}
    </div>
  `;

  await transporter.sendMail({
    from: `"${user.businessName || user.name}" <${user.email}>`,
    to: customer.email!,
    subject: `Invoice ${invoiceNumber} from ${user.businessName || user.name}`,
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
      <h2>Payment Reminder: Invoice ${invoice.number}</h2>
      <p>Dear ${invoice.customer.name},</p>
      
      <p>This is a reminder that the payment for invoice ${
        invoice.number
      } is ${daysOverdue > 0 ? `overdue by ${daysOverdue} days` : 'due today'}.</p>
      
      <p><strong>Amount Due: Rp ${invoice.total.toLocaleString('id-ID')}</strong></p>
      <p><strong>Due Date: ${invoice.dueDate.toLocaleDateString('id-ID')}</strong></p>
      
      <p>Please process the payment as soon as possible.</p>
      
      <p>Best regards,<br>${businessName}</p>
    `;

    await transporter.sendMail({
      from: `"${businessName}" <${invoice.user.email}>`,
      to: invoice.customer.email!,
      subject: `Payment Reminder: Invoice ${invoice.number}`,
      html,
    });

    logger.info(`Reminder email sent successfully to ${invoice.customer.email}`);
  } catch (error) {
    logger.error('Error sending reminder email:', error);
    throw error;
  }
}; 