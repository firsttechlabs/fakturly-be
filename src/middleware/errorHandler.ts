import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  data?: any;

  constructor(statusCode: number, message: string, data?: any) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error('Error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      ...(err.data && { data: err.data }),
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'error',
      message: 'Data tidak valid',
      errors: err.errors,
    });
  }

  // Prisma error handling
  if (err.name === 'PrismaClientKnownRequestError') {
    if ((err as any).code === 'P2002') {
      return res.status(409).json({
        status: 'error',
        message: 'Data dengan nilai tersebut sudah ada',
      });
    }
  }

  // Default error
  return res.status(500).json({
    status: 'error',
    message: 'Terjadi kesalahan pada sistem',
  });
} 