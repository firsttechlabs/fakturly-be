/*
  Warnings:

  - You are about to drop the column `currency` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "currency";

-- DropEnum
DROP TYPE "Currency";
