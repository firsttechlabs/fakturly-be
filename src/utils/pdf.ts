import puppeteer from "puppeteer";
import { Invoice, InvoiceItem, User, Customer, InvoiceStatus } from "@prisma/client";
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

function getStatusColor(status: InvoiceStatus): string {
  switch (status) {
    case "PAID":
      return "#48BB78"; // green
    case "UNPAID":
      return "#4299E1"; // blue
    case "OVERDUE":
      return "#F56565"; // red
    case "CANCELLED":
      return "#718096"; // gray
    default:
      return "#718096";
  }
}

function getStatusText(status: InvoiceStatus): string {
  switch (status) {
    case "PAID":
      return "LUNAS";
    case "UNPAID":
      return "BELUM LUNAS";
    case "OVERDUE":
      return "JATUH TEMPO";
    case "CANCELLED":
      return "DIBATALKAN";
    default:
      return status;
  }
}

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
    status,
    subtotal,
    tax,
    total,
    notes,
    user,
    customer,
    items,
  } = invoice;

  // Prepare business info section
  const businessInfoSection = `
    <div class="section-title">Informasi Bisnis</div>
    <div class="detail-label">Nama Usaha</div>
    <div class="detail-value">${user.businessName}</div>
    ${user.businessEmail ? `
    <div class="detail-label">Email Bisnis</div>
    <div class="detail-value">${user.businessEmail}</div>
    ` : ''}
    ${user.businessPhone ? `
    <div class="detail-label">Telepon Bisnis</div>
    <div class="detail-value">${user.businessPhone}</div>
    ` : ''}
    ${user.businessAddress ? `
    <div class="detail-label">Alamat Bisnis</div>
    <div class="detail-value">${user.businessAddress}</div>
    ` : ''}
  `;

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
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 40px;
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
          background-color: ${getStatusColor(status)};
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
      <div class="main-table">
        <!-- Header with Logo -->
        <div style="text-align: center; margin-bottom: 32px;">
          ${user.businessLogo ? `
            <img src="${user.businessLogo}" alt="${user.businessName}" style="max-width: 200px; max-height: 80px; margin-bottom: 12px;">
          ` : `
            <div style="font-size: 22px; font-weight: bold; color: #1976D2; margin-bottom: 12px;">
              ${user.businessName}
            </div>
          `}
        </div>

        <!-- Invoice Info -->
        <div style="background: #F8FAFC; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
          <div style="font-size: 16px; font-weight: 600; color: #2D3748; margin-bottom: 8px;">
            Faktur #${number}
          </div>
          <div class="status-badge">${getStatusText(status)}</div>
        </div>

        <!-- Business & Customer Info -->
        <table style="margin-bottom: 24px;">
          <tr>
            <td width="48%" valign="top">
              ${businessInfoSection}
            </td>
            <td width="4%"></td>
            <td width="48%" valign="top">
              <div class="section-title">Informasi Pelanggan</div>
              <div class="detail-label">Nama</div>
              <div class="detail-value">${customer.name}</div>
              ${customer.email ? `
              <div class="detail-label">Email</div>
              <div class="detail-value">${customer.email}</div>
              ` : ''}
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
        <table style="margin-bottom: 24px;">
          <tr>
            <td>
              <div class="section-title">Detail Faktur</div>
              <table style="margin-top: 8px;">
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
        <div style="margin-bottom: 24px;">
          <div class="section-title" style="margin-bottom: 8px;">Rincian Item</div>
          <table class="items-table">
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
          <table style="margin-top: 12px;">
            <tr>
              <td width="60%"></td>
              <td width="40%">
                <table width="100%" cellpadding="4">
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
        </div>

        ${notes ? `
        <!-- Notes -->
        <div class="notes" style="margin-bottom: 24px;">
          <div class="section-title">Catatan</div>
          ${notes}
        </div>
        ` : ''}

        <!-- Footer -->
        <div style="text-align: center; padding-top: 24px; border-top: 1px solid #E2E8F0;">
          <div style="font-size: 13px; color: #718096;">
            Dokumen ini dibuat otomatis oleh sistem Fakturly.
            ${status !== "PAID" ? `<br>Harap melakukan pembayaran sebelum ${formatDate(dueDate)}.` : ''}
          </div>
        </div>
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
