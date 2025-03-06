import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Check if admin user exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@fakturly.com' }
  });

  if (!existingAdmin) {
    // Create admin user
    const hashedPassword = await bcrypt.hash('Fakturlyjiwa123!', 10);
    const admin = await prisma.user.create({
      data: {
        email: 'admin@fakturly.com',
        name: 'admin',
        password: hashedPassword,
        role: Role.ADMIN,
        isActive: true,
        settings: {
          create: {
            licenseKey: 'ADMIN-LICENSE-KEY',
            licenseStatus: 'ACTIVE'
          }
        }
      }
    });
    console.log('Admin user created:', admin.email);
  } else {
    console.log('Admin user already exists, skipping...');
  }

  // Check if promo code exists
  const existingPromo = await prisma.promoCode.findUnique({
    where: { code: 'BERKAHBOSQUE' }
  });

  if (!existingPromo) {
    // Create promo code for first 50 users
    const promoCode = await prisma.promoCode.create({
      data: {
        code: 'BERKAHBOSQUE',
        description: 'Promo khusus 50 pengguna pertama',
        discountType: 'PERCENTAGE',
        discountValue: 100, // 100% discount
        maxUses: 50,
        currentUses: 0,
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Valid for 1 year
        isActive: true
      }
    });
    console.log('Promo code created:', promoCode.code);
  } else {
    console.log('Promo code already exists, skipping...');
  }

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 