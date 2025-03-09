import puppeteer from "puppeteer";
import { Invoice, InvoiceItem, User, Customer } from "@prisma/client";
import { formatDate, formatRupiah } from "./email";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
  user: Pick<User, "businessName" | "businessEmail" | "businessPhone" | "businessAddress" | "businessLogo">;
  customer: Customer;
};

// Helper function to upload buffer to Cloudinary
async function uploadToCloudinary(
  buffer: Buffer,
  publicId: string
): Promise<string> {
  const folderPath = `fakturly/invoices`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: folderPath,
        format: "pdf",
        resource_type: "raw",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      }
    );

    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}

export async function generateInvoicePDF(
  invoice: InvoiceWithItems
): Promise<string> {
  const {
    number,
    date,
    dueDate,
    subtotal,
    tax,
    total,
    notes,
    user,
    customer,
    items,
  } = invoice;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Faktur #${number}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 40px;
          color: #333;
        }
        .header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
        }
        .logo {
          max-width: 150px;
          height: auto;
        }
        .business-info {
          text-align: right;
        }
        .business-name {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .invoice-title {
          font-size: 28px;
          font-weight: bold;
          margin-bottom: 30px;
        }
        .info-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
        }
        .info-column {
          flex: 1;
        }
        .info-column.right {
          text-align: right;
        }
        .info-label {
          color: #666;
          margin-bottom: 5px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .table th {
          background: #f3f4f6;
          padding: 12px;
          text-align: left;
        }
        .table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        .table th:not(:first-child),
        .table td:not(:first-child) {
          text-align: right;
        }
        .summary {
          width: 300px;
          margin-left: auto;
          background: #f9fafb;
          padding: 20px;
          border-radius: 4px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .summary-row.total {
          font-weight: bold;
          font-size: 16px;
          border-top: 2px solid #e5e7eb;
          padding-top: 10px;
          margin-top: 10px;
        }
        .notes {
          margin-top: 40px;
        }
        .notes-label {
          font-weight: bold;
          margin-bottom: 10px;
        }
        .footer {
          margin-top: 60px;
          text-align: center;
          color: #6b7280;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          ${user.businessLogo ? `<img src="${user.businessLogo}" class="logo" alt="Logo">` : ''}
        </div>
        <div class="business-info">
          <div class="business-name">${user.businessName}</div>
          ${user.businessAddress ? `<div>${user.businessAddress}</div>` : ''}
          ${user.businessEmail ? `<div>${user.businessEmail}</div>` : ''}
          ${user.businessPhone ? `<div>${user.businessPhone}</div>` : ''}
        </div>
      </div>

      <div class="invoice-title">FAKTUR #${number}</div>

      <div class="info-section">
        <div class="info-column">
          <div class="info-label">Tanggal Faktur:</div>
          <div>${formatDate(date)}</div>
          <div class="info-label" style="margin-top: 15px">Jatuh Tempo:</div>
          <div>${formatDate(dueDate)}</div>
        </div>
        <div class="info-column right">
          <div class="info-label">Kepada:</div>
          <div style="font-weight: bold">${customer.name}</div>
          ${customer.email ? `<div>${customer.email}</div>` : ''}
          ${customer.phone ? `<div>${customer.phone}</div>` : ''}
          ${customer.address ? `<div>${customer.address}</div>` : ''}
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th style="width: 50%">Deskripsi</th>
            <th style="width: 15%">Jumlah</th>
            <th style="width: 15%">Harga</th>
            <th style="width: 20%">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td>${item.quantity}</td>
              <td>${formatRupiah(item.price)}</td>
              <td>${formatRupiah(item.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="summary">
        <div class="summary-row">
          <div>Subtotal:</div>
          <div>${formatRupiah(subtotal)}</div>
        </div>
        <div class="summary-row">
          <div>Pajak:</div>
          <div>${formatRupiah(tax)}</div>
        </div>
        <div class="summary-row total">
          <div>Total:</div>
          <div>${formatRupiah(total)}</div>
        </div>
      </div>

      ${notes ? `
        <div class="notes">
          <div class="notes-label">Catatan:</div>
          <div>${notes}</div>
        </div>
      ` : ''}

      <div class="footer">
        Dokumen ini dibuat otomatis oleh sistem Fakturly.
      </div>
    </body>
    </html>
  `;

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // Create new page
    const page = await browser.newPage();

    // Set content
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      }
    });

    // Upload to Cloudinary
    const publicId = `invoice_${number}`;
    const pdfUrl = await uploadToCloudinary(pdfBuffer as Buffer, publicId);

    return pdfUrl;
  } finally {
    await browser.close();
  }
}
