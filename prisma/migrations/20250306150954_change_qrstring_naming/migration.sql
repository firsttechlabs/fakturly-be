/*
  Warnings:

  - You are about to drop the column `qr_string` on the `Payment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "qr_string",
ADD COLUMN     "qrString" TEXT;
