/*
  Warnings:

  - The `currency` column on the `Settings` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('IDR', 'USD');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'IDR';

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "currency",
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'IDR';
