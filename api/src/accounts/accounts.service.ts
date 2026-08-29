import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { AddCashDto } from './dto/add-cash.dto';

type TxClient = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

export interface PostAccountTransactionParams {
  accountId: string;
  amount: Prisma.Decimal | number | string;
  description: string;
  entryDate?: Date;
  createdByUserId: string;
  customerPaymentId?: string;
  supplierPaymentId?: string;
  supplierAdvanceId?: string;
  expenseId?: string;
}

/**
 * Cash and bank balances the factory actually holds (ACC-01/ACC-02). There is exactly one
 * CASH account and one CHEQUE_CLEARING account, created lazily the first time either is
 * needed, plus as many BANK accounts as the business has. Every customer/supplier payment,
 * supplier advance, and expense posts exactly one AccountTransaction here in the same
 * database transaction as the rest of its posting — these balances are a byproduct of the
 * payment records, not a separate source of truth that could drift from them.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return {
      cash: accounts.find((a) => a.type === AccountType.CASH) ?? null,
      chequeClearing:
        accounts.find((a) => a.type === AccountType.CHEQUE_CLEARING) ?? null,
      banks: accounts.filter((a) => a.type === AccountType.BANK),
    };
  }

  async findOrThrow(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async transactionHistory(id: string, page = 1, pageSize = 20) {
    await this.findOrThrow(id);
    const [data, total] = await Promise.all([
      this.prisma.accountTransaction.findMany({
        where: { accountId: id },
        orderBy: { entryDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.accountTransaction.count({ where: { accountId: id } }),
    ]);
    return {
      data,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Bank accounts are the only account type an Admin creates directly — Cash and Cheque
   * Clearing are singleton system accounts created automatically the first time they're used. */
  async createBankAccount(dto: CreateBankAccountDto, actorId: string) {
    const openingBalance = new Prisma.Decimal(dto.openingBalance ?? 0);
    const account = await this.prisma.account.create({
      data: {
        name: dto.name,
        type: AccountType.BANK,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        openingBalance,
        currentBalance: openingBalance,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'Account',
      entityId: account.id,
      afterData: account,
    });
    return account;
  }

  /** The only way cash enters the system without a corresponding customer/supplier payment —
   * e.g. the owner topping up the till. Always a positive adjustment, always audited. */
  async addCash(dto: AddCashDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const cashAccount = await this.getOrCreateSingleton(tx, AccountType.CASH);
      const entry = await this.postTransaction(tx, {
        accountId: cashAccount.id,
        amount: dto.amount,
        description: `Manual cash added${dto.remarks ? ` — ${dto.remarks}` : ''}`,
        entryDate: dto.entryDate,
        createdByUserId: actorId,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'AccountTransaction',
          entityId: entry.id,
          afterData: entry,
        },
        tx,
      );
      return entry;
    });
  }

  /** Finds the singleton Cash or Cheque Clearing account, creating it on first use. Bank
   * accounts are never auto-created — those always come from an explicit Admin action. */
  async getOrCreateSingleton(
    tx: TxClient,
    type: typeof AccountType.CASH | typeof AccountType.CHEQUE_CLEARING,
  ) {
    const existing = await tx.account.findFirst({ where: { type } });
    if (existing) return existing;
    return tx.account.create({
      data: {
        name: type === AccountType.CASH ? 'Cash' : 'Cheques (Clearing)',
        type,
        openingBalance: ZERO,
        currentBalance: ZERO,
      },
    });
  }

  /** Resolves which account a payment method posts to: Cash and Cheque go to their singleton
   * account, Bank Transfer requires the caller to have already picked a specific bank account
   * (LED-07 — this is enforced by the caller, not here, since the error message differs by
   * document type). */
  async resolveAccountId(
    tx: TxClient,
    method: PaymentMethod,
    explicitAccountId: string | undefined | null,
  ): Promise<string> {
    if (method === PaymentMethod.BANK_TRANSFER) {
      if (!explicitAccountId) {
        throw new BadRequestException(
          'A bank account must be selected for Bank Transfer payments',
        );
      }
      const account = await tx.account.findUnique({
        where: { id: explicitAccountId },
      });
      if (!account || account.type !== AccountType.BANK) {
        throw new BadRequestException(
          'Selected account is not a valid bank account',
        );
      }
      return account.id;
    }
    if (method === PaymentMethod.CHEQUE) {
      const account = await this.getOrCreateSingleton(
        tx,
        AccountType.CHEQUE_CLEARING,
      );
      return account.id;
    }
    // CASH, UPI, OTHER all post to the cash account by default — the register only names
    // Cash, Bank Transfer and Cheque as tracked methods.
    const account = await this.getOrCreateSingleton(tx, AccountType.CASH);
    return account.id;
  }

  async postTransaction(tx: TxClient, params: PostAccountTransactionParams) {
    const account = await tx.account.findUniqueOrThrow({
      where: { id: params.accountId },
    });
    const amount = new Prisma.Decimal(params.amount);
    const balanceAfter = account.currentBalance.plus(amount);

    const entry = await tx.accountTransaction.create({
      data: {
        accountId: params.accountId,
        amount,
        balanceAfter,
        description: params.description,
        entryDate: params.entryDate ?? new Date(),
        createdByUserId: params.createdByUserId,
        customerPaymentId: params.customerPaymentId,
        supplierPaymentId: params.supplierPaymentId,
        supplierAdvanceId: params.supplierAdvanceId,
        expenseId: params.expenseId,
      },
    });

    await tx.account.update({
      where: { id: params.accountId },
      data: { currentBalance: balanceAfter },
    });

    return entry;
  }
}
