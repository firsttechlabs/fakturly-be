import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth";
import { invoiceRouter } from "./routes/invoice";
import { userRouter } from "./routes/user";
import { settingRouter } from "./routes/settings";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./utils/logger";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/auth", authRouter);
app.use("/invoices", invoiceRouter);
app.use("/users", userRouter);
app.use("/settings", settingRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});
