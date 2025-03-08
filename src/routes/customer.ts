import { NextFunction, Response, Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { AuthenticatedRequest } from "../types/express";
import { prisma } from "../utils/prisma";

const router = Router();

const createCustomerSchema = z.object({
  name: z.string().min(1, "Nama pelanggan wajib diisi"),
  email: z.string().email("Email tidak valid").optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateCustomerSchema = createCustomerSchema.partial();

// Add query parameter validation
const getCustomersQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('10'),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'email', 'phone', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

router.use(authenticate);

// Get all customers with pagination and search
router.get("/", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { 
      page, 
      limit, 
      search,
      sortBy,
      sortOrder 
    } = getCustomersQuerySchema.parse(req.query);

    // Build where clause
    const where: any = {
      userId: req.user?.id,
    };

    // Add search condition
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count for search results
    const total = await prisma.customer.count({ where });

    // Get paginated results with invoice count
    const customers = await prisma.customer.findMany({
      where,
      include: {
        invoices: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({
      status: "success",
      data: {
        customers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get single customer
router.get("/:id", async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: {
        id: req.params.id,
        userId: (req as any).user.id,
      },
      include: {
        invoices: {
          orderBy: { date: "desc" },
          select: {
            id: true,
            number: true,
            date: true,
            dueDate: true,
            status: true,
            total: true
          }
        },
      },
    });

    if (!customer) {
      throw new AppError(404, "Pelanggan tidak ditemukan");
    }

    res.json({
      status: "success",
      data: customer,
    });
  } catch (error) {
    next(error);
  }
});

// Create customer
router.post("/", async (req, res, next) => {
  try {
    const data = createCustomerSchema.parse(req.body);
    const userId = (req as any).user.id;

    // Check if customer with same email already exists for this user
    if (data.email) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          userId,
          email: data.email,
        },
      });

      if (existingCustomer) {
        throw new AppError(400, "Pelanggan dengan email ini sudah terdaftar");
      }
    }

    const customer = await prisma.customer.create({
      data: {
        ...data,
        userId,
      },
    });

    res.json({
      status: "success",
      data: customer,
    });
  } catch (error) {
    next(error);
  }
});

// Update customer
router.patch("/:id", async (req, res, next) => {
  try {
    const data = updateCustomerSchema.parse(req.body);
    const userId = (req as any).user.id;

    // Check if customer exists and belongs to user
    const existingCustomer = await prisma.customer.findUnique({
      where: {
        id: req.params.id,
        userId,
      },
    });

    if (!existingCustomer) {
      throw new AppError(404, "Pelanggan tidak ditemukan");
    }

    // Check if email is being updated and if it's already taken
    if (data.email && data.email !== existingCustomer.email) {
      const emailTaken = await prisma.customer.findFirst({
        where: {
          userId,
          email: data.email,
          NOT: {
            id: req.params.id,
          },
        },
      });

      if (emailTaken) {
        throw new AppError(400, "Email sudah digunakan oleh pelanggan lain");
      }
    }

    const customer = await prisma.customer.update({
      where: {
        id: req.params.id,
        userId,
      },
      data,
    });

    res.json({
      status: "success",
      data: customer,
    });
  } catch (error) {
    next(error);
  }
});

// Delete customer
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req as any).user.id;

    // Check if customer has any invoices
    const customer = await prisma.customer.findUnique({
      where: {
        id: req.params.id,
        userId,
      },
      include: {
        _count: {
          select: { invoices: true }
        }
      }
    });

    if (!customer) {
      throw new AppError(404, "Pelanggan tidak ditemukan");
    }

    if (customer._count.invoices > 0) {
      throw new AppError(400, "Tidak dapat menghapus pelanggan yang memiliki faktur");
    }

    await prisma.customer.delete({
      where: {
        id: req.params.id,
        userId,
      },
    });

    res.json({
      status: "success",
      message: "Pelanggan berhasil dihapus",
    });
  } catch (error) {
    next(error);
  }
});

export const customerRouter = router; 