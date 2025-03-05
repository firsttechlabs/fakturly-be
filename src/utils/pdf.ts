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
  user: Pick<User, "name" | "businessName" | "email" | "phone" | "address">;
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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Faktur #${number}</title>
      <style>
        @page {
          margin: 0;
          size: A4;
        }
        body { 
          margin: 0; 
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.4;
          color: #2D3748;
          background-color: white;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        table {
          border-collapse: collapse;
          width: 100%;
        }
        td {
          padding: 0;
        }
        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #4A5568;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .detail-label {
          font-size: 13px;
          color: #718096;
          margin-bottom: 2px;
        }
        .detail-value {
          font-size: 14px;
          color: #2D3748;
          margin-bottom: 8px;
        }
        .items-table {
          margin-top: 16px;
        }
        .items-table th {
          background: #F8FAFC;
          padding: 12px;
          text-align: left;
          font-size: 13px;
          font-weight: 600;
          color: #4A5568;
          border-bottom: 1px solid #E2E8F0;
          border-top: 1px solid #E2E8F0;
        }
        .items-table td {
          padding: 12px;
          font-size: 13px;
          color: #4A5568;
          border-bottom: 1px solid #E2E8F0;
        }
        .amount-right {
          text-align: right;
        }
        .notes {
          background: #FFFAF0;
          padding: 16px;
          font-size: 13px;
          color: #744210;
          border-radius: 4px;
          margin-top: 24px;
        }
        .totals-table {
          width: 100%;
          max-width: 300px;
          margin-left: auto;
          margin-top: 16px;
        }
        .totals-table td {
          padding: 8px 0;
        }
        .total-row {
          font-weight: 600;
          font-size: 14px;
          border-top: 1px solid #E2E8F0;
          padding-top: 12px !important;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <table>
          <tr>
            <td align="center" style="padding-bottom: 24px; border-bottom: 1px solid #E2E8F0;">
              <div style="font-size: 24px; font-weight: bold; color: #1976D2; margin-bottom: 4px;">FAKTURLY</div>
              <div style="font-size: 14px; color: #718096;">Solusi Pencatatan Faktur & Reminder Pembayaran</div>
            </td>
          </tr>
        </table>

        <!-- Invoice Info -->
        <table style="margin-top: 24px;">
          <tr>
            <td style="background: #F8FAFC; padding: 16px; border-radius: 4px;">
              <div style="font-size: 18px; font-weight: 600; color: #2D3748;">Faktur #${number}</div>
            </td>
          </tr>
        </table>

        <!-- Business & Customer Info -->
        <table style="margin-top: 24px;">
          <tr>
            <td width="48%" valign="top">
              <div class="section-title">Informasi Bisnis</div>
              <div class="detail-value" style="font-weight: 600;">${
                user.businessName || user.name
              }</div>
              ${
                user.address
                  ? `<div class="detail-value">${user.address}</div>`
                  : ""
              }
              ${
                user.phone
                  ? `<div class="detail-value">${user.phone}</div>`
                  : ""
              }
              ${
                user.email
                  ? `<div class="detail-value">${user.email}</div>`
                  : ""
              }
            </td>
            <td width="4%"></td>
            <td width="48%" valign="top">
              <div class="section-title">Informasi Pelanggan</div>
              <div class="detail-value" style="font-weight: 600;">${
                customer.name
              }</div>
              ${
                customer.address
                  ? `<div class="detail-value">${customer.address}</div>`
                  : ""
              }
              ${
                customer.phone
                  ? `<div class="detail-value">${customer.phone}</div>`
                  : ""
              }
              ${
                customer.email
                  ? `<div class="detail-value">${customer.email}</div>`
                  : ""
              }
            </td>
          </tr>
        </table>

        <!-- Invoice Details -->
        <table style="margin-top: 24px;">
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

        <!-- Items -->
        <div style="margin-top: 24px;">
          <div class="section-title">Rincian Item</div>
          <table class="items-table">
            <thead>
              <tr>
                <th width="40%">Deskripsi</th>
                <th width="20%">Jumlah</th>
                <th width="20%">Harga</th>
                <th width="20%" style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (item) => `
                <tr>
                  <td>${item.description}</td>
                  <td>${item.quantity}</td>
                  <td>Rp ${formatRupiah(item.price)}</td>
                  <td style="text-align: right;">Rp ${formatRupiah(
                    item.amount
                  )}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>

          <!-- Totals -->
          <table class="totals-table">
            <tr>
              <td>Subtotal</td>
              <td style="text-align: right;">Rp ${formatRupiah(subtotal)}</td>
            </tr>
            <tr>
              <td>Pajak</td>
              <td style="text-align: right;">Rp ${formatRupiah(tax)}</td>
            </tr>
            <tr>
              <td class="total-row">Total</td>
              <td class="total-row" style="text-align: right;">Rp ${formatRupiah(
                total
              )}</td>
            </tr>
          </table>
        </div>

        ${
          notes
            ? `
          <div class="notes">
            <div class="section-title">Catatan</div>
            ${notes}
          </div>
        `
            : ""
        }

        <!-- Footer -->
        <table style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #E2E8F0;">
          <tr>
            <td align="center" style="font-size: 13px; color: #718096;">
              Terima kasih atas kepercayaan Anda.
            </td>
          </tr>
        </table>
      </div>
    </body>
    </html>
  `;

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // Create new page
    const page = await browser.newPage();

    // Set content
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    // Generate PDF
    const pdfBuffer = (await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    })) as Buffer;

    // Upload to Cloudinary
    const publicId = `invoice_${number}`;
    const pdfUrl = await uploadToCloudinary(pdfBuffer, publicId);

    return pdfUrl;
  } finally {
    await browser.close();
  }
}
