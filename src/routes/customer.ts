import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { AppError } from "../middleware/errorHandler";
import { z } from "zod";

const router = Router();

const createCustomerSchema = z.object({
  name: z.string().min(1, "Nama pelanggan wajib diisi"),
  email: z.string().email("Email tidak valid").optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateCustomerSchema = createCustomerSchema.partial();

router.use(authenticate);

// Get all customers
router.get("/", async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { userId: (req as any).user.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { invoices: true }
        }
      }
    });

    res.json({
      status: "success",
      data: customers,
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