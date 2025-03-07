/*
  Warnings:

  - Added the required column `channel` to the `InvoiceReminder` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `InvoiceReminder` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `InvoiceReminder` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "InvoiceReminder" ADD COLUMN     "channel" "ReminderChannel" NOT NULL,
ADD COLUMN     "notes" TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "ReminderType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ReminderStatus" NOT NULL;

-- CreateIndex
CREATE INDEX "InvoiceReminder_type_idx" ON "InvoiceReminder"("type");

-- CreateIndex
CREATE INDEX "InvoiceReminder_channel_idx" ON "InvoiceReminder"("channel");

-- CreateIndex
CREATE INDEX "InvoiceReminder_status_idx" ON "InvoiceReminder"("status");
