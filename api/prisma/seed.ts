import { PrismaClient, PermissionEffect } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS } from '../src/iam/permissions.catalog';

const prisma = new PrismaClient();

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: PERMISSIONS.map((p) => p.key), // full access, always
  SALES_EMPLOYEE: [
    'quotation.view',
    'quotation.create',
    'quotation.edit',
    'quotation.convert',
    'sales_invoice.view',
    'sales_invoice.create',
    'sales_invoice.edit',
    'sales_invoice.finalize',
    'sales_return.view',
    'sales_return.create',
    'customer.view',
    'customer.manage',
    'customer_ledger.view',
    'customer_payment.create',
    'receipt_voucher.print',
  ],
  MANAGER: [
    'customer.view',
    'customer_ledger.view',
    'supplier.view',
    'supplier_ledger.view',
    'product_pnl.view',
  ],
};

async function main() {
  console.log('Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      create: perm,
      update: { groupName: perm.groupName, description: perm.description },
    });
  }

  console.log('Seeding roles...');
  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, isSystem: true },
      update: { isSystem: true },
    });

    const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  console.log('Seeding default admin user...');
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@hexenex.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
        fullName: 'Hexenex Administrator',
        roleId: adminRole.id,
      },
    });
    console.log(`  created ${adminEmail} — CHANGE THIS PASSWORD after first login: ${adminPassword}`);
  } else {
    console.log(`  admin user ${adminEmail} already exists, skipping`);
  }

  console.log('Seeding locations...');
  await prisma.location.upsert({
    where: { name: 'Main Office' },
    create: { name: 'Main Office', type: 'FACTORY' },
    update: {},
  });
  await prisma.location.upsert({
    where: { name: 'Operations Center' },
    create: { name: 'Operations Center', type: 'SHOWROOM' },
    update: {},
  });

  console.log('Seeding product categories...');
  const categories = ['Services', 'Hardware', 'Software', 'Supplies', 'General Inventory'];
  for (const name of categories) {
    await prisma.productCategory.upsert({ where: { name }, create: { name }, update: {} });
  }

  console.log('Seeding expense categories...');
  const expenseCategories = ['Salaries', 'Utilities', 'Infrastructure', 'Marketing & Sales', 'Other'];
  for (const name of expenseCategories) {
    await prisma.expenseCategory.upsert({ where: { name }, create: { name }, update: {} });
  }

  console.log('Seeding company settings...');
  await prisma.companySettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', companyName: 'Hexenex' },
    update: { companyName: 'Hexenex' },
  });

  console.log('Seeding quotation calculation profiles...');
  // The client confirmed their actual formula via a reference document (see
  // docs/client-clarifications.md item 1): sqft = qty * width * length / 144, where width is
  // either manually typed ("Fix") or one of the factory's standard counter widths in inches;
  // "Self" bypasses the formula and takes a directly typed sq ft. This is now the default.
  await prisma.quotationCalculationProfile.upsert({
    where: { id: 'sqft-dimensions' },
    create: {
      id: 'sqft-dimensions',
      name: 'Sq ft from dimensions (qty × width × length ÷ 144)',
      strategyKey: 'SQFT_DIMENSIONS',
      parameters: {},
      isDefault: true,
    },
    update: { isDefault: true },
  });
  // Kept registered (not deleted) as a manual-entry fallback, but no longer the default.
  await prisma.quotationCalculationProfile.upsert({
    where: { id: 'placeholder-manual' },
    create: {
      id: 'placeholder-manual',
      name: 'Manual entry (no dimension formula)',
      strategyKey: 'PLACEHOLDER_MANUAL',
      parameters: {},
      isDefault: false,
    },
    update: { isDefault: false },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
