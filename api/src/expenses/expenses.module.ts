import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { AuditModule } from '../audit/audit.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingModule } from '../numbering/numbering.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [AuditModule, TransactionsModule, NumberingModule, AccountsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
