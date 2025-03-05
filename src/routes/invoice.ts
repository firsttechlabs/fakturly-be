import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { sendInvoiceEmail } from "../utils/email";
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";

const router = Router();

const createInvoiceSchema = z.object({
  customerName: z.string(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  issueDate: z.string(),
  dueDate: z.string(),
  items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
    })
  ),
  taxRate: z.number().optional(),
  customerId: z.string().optional(), // Optional: if customer already exists
});

const updateInvoiceSchema = z.object({
  status: z.enum(["UNPAID", "PAID", "OVERDUE", "CANCELLED"]).optional(),
  dueDate: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: "Invalid due date",
    })
    .optional(),
  notes: z.string().optional(),
});

router.use(authenticate);

// Get all invoices
router.get("/", async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: (req as any).user.id },
      include: {
        items: true,
        customer: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      status: "success",
      data: invoices,
    });
  } catch (error) {
    next(error);
  }
});

// Get single invoice
router.get("/:id", async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: {
        id: req.params.id,
        userId: (req as any).user.id,
      },
      include: {
        items: true,
        customer: true,
      },
    });

    if (!invoice) {
      throw new AppError(404, "Invoice not found");
    }

    res.json({
      status: "success",
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
});

// Create invoice
router.post("/", authenticate, async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const data = createInvoiceSchema.parse(req.body);

    // Calculate totals
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    const tax = data.taxRate ? (subtotal * data.taxRate) / 100 : 0;
    const total = subtotal + tax;

    // Get or create customer
    let customerId = data.customerId;
    if (!customerId) {
      // Create new customer
      const customer = await prisma.customer.create({
        data: {
          name: data.customerName,
          email: data.customerEmail,
          phone: data.customerPhone,
          userId,
        },
      });
      customerId = customer.id;
    }

    // Get next invoice number
    const settings = await prisma.settings.findUnique({
      where: { userId },
    });

    if (!settings) {
      throw new AppError(400, "User settings not found");
    }

    const invoicePrefix = settings.invoicePrefix || "INV";
    const nextNumber = settings.nextInvoiceNumber;
    const invoiceNumber = `${invoicePrefix}${String(nextNumber).padStart(
      5,
      "0"
    )}`;

    // Create invoice with items
    const invoice = await prisma.invoice.create({
      data: {
        number: invoiceNumber,
        date: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        subtotal,
        tax,
        total,
        userId,
        customerId,
        items: {
          create: data.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            price: item.unitPrice,
            amount: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        items: true,
        customer: true,
      },
    });

    // Increment invoice number
    await prisma.settings.update({
      where: { userId },
      data: {
        nextInvoiceNumber: {
          increment: 1,
        },
      },
    });

    res.json({
      status: "success",
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
});

// Update invoice
router.patch("/:id", async (req, res, next) => {
  try {
    const data = updateInvoiceSchema.parse(req.body);

    const invoice = await prisma.invoice.update({
      where: {
        id: req.params.id,
        userId: (req as any).user.id,
      },
      data,
      include: {
        items: true,
      },
    });

    res.json({
      status: "success",
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
});

// Delete invoice
router.delete("/:id", async (req, res, next) => {
  try {
    await prisma.invoice.delete({
      where: {
        id: req.params.id,
        userId: (req as any).user.id,
      },
    });

    res.json({
      status: "success",
      data: null,
    });
  } catch (error) {
    next(error);
  }
});

// Send invoice
router.post("/:id/send", async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: {
        id: req.params.id,
        userId: (req as any).user.id,
      },
      include: {
        items: true,
        user: {
          select: {
            name: true,
            businessName: true,
            email: true,
          },
        },
        customer: true,
      },
    });

    if (!invoice) {
      throw new AppError(404, "Invoice not found");
    }

    await sendInvoiceEmail(invoice);

    await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: "SENT" },
    });

    res.json({
      status: "success",
      message: "Invoice sent successfully",
    });
  } catch (error) {
    next(error);
  }
});

// Get dashboard statistics
router.get("/stats/overview", authenticate, async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    const startOfCurrentMonth = startOfMonth(today);
    const endOfCurrentMonth = endOfMonth(today);
    const startOfLastMonth = startOfMonth(subMonths(today, 1));
    const endOfLastMonth = endOfMonth(subMonths(today, 1));

    // Get total invoices and amount
    const [totalInvoices, totalAmount, unpaidAmount, overdueAmount] =
      await Promise.all([
        prisma.invoice.count({ where: { userId } }),
        prisma.invoice.aggregate({
          where: { userId, status: "PAID" },
          _sum: { total: true },
        }),
        prisma.invoice.aggregate({
          where: { userId, status: "UNPAID" },
          _sum: { total: true },
        }),
        prisma.invoice.aggregate({
          where: { userId, status: "OVERDUE" },
          _sum: { total: true },
        }),
      ]);

    // Get daily revenue for the last 30 days
    const dailyRevenue = await prisma.invoice.findMany({
      where: {
        userId,
        status: "PAID",
        date: {
          gte: thirtyDaysAgo,
          lte: today,
        },
      },
      select: {
        date: true,
        total: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    // Group daily revenue by date
    const dailyRevenueGrouped = dailyRevenue.reduce((acc: any[], invoice) => {
      const date = startOfDay(invoice.date);
      const existingDay = acc.find(
        (day) => day.date.getTime() === date.getTime()
      );

      if (existingDay) {
        existingDay.total += invoice.total;
      } else {
        acc.push({ date, total: invoice.total });
      }

      return acc;
    }, []);

    // Fill in missing days with zero revenue
    const dailyRevenueComplete = [];
    let currentDate = thirtyDaysAgo;

    while (currentDate <= today) {
      const existingDay = dailyRevenueGrouped.find(
        (day) => day.date.getTime() === startOfDay(currentDate).getTime()
      );

      dailyRevenueComplete.push({
        date: startOfDay(currentDate),
        total: existingDay ? existingDay.total : 0,
      });

      currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
    }

    // Get current month and last month revenue
    const [currentMonthRevenue, lastMonthRevenue] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          userId,
          status: "PAID",
          date: {
            gte: startOfCurrentMonth,
            lte: endOfCurrentMonth,
          },
        },
        _sum: { total: true },
      }),
      prisma.invoice.aggregate({
        where: {
          userId,
          status: "PAID",
          date: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
        _sum: { total: true },
      }),
    ]);

    // Get status distribution
    const statusDistribution = await prisma.invoice.groupBy({
      by: ["status"],
      where: { userId },
      _count: true,
      orderBy: {
        status: "asc",
      },
    });

    res.json({
      status: "success",
      data: {
        overview: {
          totalInvoices,
          totalAmount: totalAmount._sum.total || 0,
          unpaidAmount: unpaidAmount._sum.total || 0,
          overdueAmount: overdueAmount._sum.total || 0,
        },
        dailyRevenue: dailyRevenueComplete,
        monthlyComparison: {
          currentMonth: currentMonthRevenue._sum.total || 0,
          lastMonth: lastMonthRevenue._sum.total || 0,
        },
        statusDistribution: statusDistribution.map((status) => ({
          name: status.status,
          value: status._count,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get revenue by date range
router.get("/stats/revenue", authenticate, async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new AppError(400, "Start date and end date are required");
    }

    const start = startOfDay(new Date(startDate as string));
    const end = endOfDay(new Date(endDate as string));

    const revenue = await prisma.invoice.groupBy({
      by: ["date"],
      where: {
        userId,
        date: {
          gte: start,
          lte: end,
        },
        status: "PAID",
      },
      _sum: {
        total: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    res.json({
      status: "success",
      data: revenue,
    });
  } catch (error) {
    next(error);
  }
});

export const invoiceRouter = router;
