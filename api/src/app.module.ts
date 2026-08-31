import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { NumberingModule } from './numbering/numbering.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AuditModule } from './audit/audit.module';
import { CompanySettingsModule } from './company-settings/company-settings.module';
import { IamModule } from './iam/iam.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { LocationsModule } from './locations/locations.module';
import { CostingModule } from './costing/costing.module';
import { CustomerLedgerModule } from './customer-ledger/customer-ledger.module';
import { SupplierLedgerModule } from './supplier-ledger/supplier-ledger.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasesModule } from './purchases/purchases.module';
import { QuotationsModule } from './quotations/quotations.module';
import { SalesInvoicesModule } from './sales-invoices/sales-invoices.module';
import { SalesReturnsModule } from './sales-returns/sales-returns.module';
import { CustomerPaymentsModule } from './customer-payments/customer-payments.module';
import { SupplierPaymentsModule } from './supplier-payments/supplier-payments.module';
import { SettlementsModule } from './settlements/settlements.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReportsModule } from './reports/reports.module';
import { AccountsModule } from './accounts/accounts.module';

import * as fs from 'node:fs';

const staticPath = fs.existsSync(join(__dirname, '..', 'web', 'out'))
  ? join(__dirname, '..', 'web', 'out')
  : join(__dirname, '..', '..', 'web', 'out');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: staticPath,
      // NestJS 11 / Express 5 uses path-to-regexp v8, which requires named
      // wildcards. Keep API requests away from the static SPA fallback.
      exclude: ['/api', '/api/{*path}'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    NumberingModule,
    TransactionsModule,
    AuditModule,
    CompanySettingsModule,
    IamModule,
    AuthModule,
    CatalogModule,
    LocationsModule,
    CostingModule,
    CustomerLedgerModule,
    SupplierLedgerModule,
    CustomersModule,
    SuppliersModule,
    InventoryModule,
    PurchasesModule,
    QuotationsModule,
    SalesInvoicesModule,
    SalesReturnsModule,
    CustomerPaymentsModule,
    SupplierPaymentsModule,
    SettlementsModule,
    ExpensesModule,
    ReportsModule,
    AccountsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
