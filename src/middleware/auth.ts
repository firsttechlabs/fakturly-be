import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";
import { Role } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
  };
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ message: "Token tidak ditemukan" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      role: Role;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      res.status(401).json({ message: "User tidak ditemukan" });
      return;
    }

    (req as AuthRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (error) {
    res.status(401).json({ message: "Token tidak valid" });
  }
};

export const requirePayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const payment = await prisma.payment.findFirst({
      where: {
        userId: authReq.user.id,
        status: "SUCCESS",
      },
    });

    if (!payment) {
      res
        .status(403)
        .json({ message: "Pembayaran diperlukan untuk mengakses fitur ini" });
      return;
    }

    next();
  } catch (error) {
    console.error("Error checking payment status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== "ADMIN") {
    res.status(403).json({ message: "Akses ditolak" });
    return;
  }
  next();
};
