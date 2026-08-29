import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { AuditModule } from '../audit/audit.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingModule } from '../numbering/numbering.module';
import { CostingModule } from '../costing/costing.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';

@Module({
  imports: [AuditModule, TransactionsModule, NumberingModule, CostingModule, CompanySettingsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
