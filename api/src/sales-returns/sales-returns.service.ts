import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerLedgerEntryType,
  DocumentType,
  MovementSourceType,
  MovementType,
  Prisma,
  SalesInvoiceStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NumberingService } from '../numbering/numbering.service';
import { CostingStrategyRegistry } from '../costing/costing-strategy.registry';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { paginate } from '../common/pagination.dto';
import { CreateSalesReturnDto } from './dto/create-sales-return.dto';
import { ListSalesReturnsQueryDto } from './dto/list-sales-returns-query.dto';

const ZERO = new Prisma.Decimal(0);

const INCLUDE = {
  customer: true,
  salesInvoice: true,
  items: { include: { product: true, salesInvoiceItem: true } },
};

/**
 * Restores returned stock at the ORIGINAL sale's unit cost (read off the matching SALE
 * `InventoryMovement`), not current cost — see docs/client-clarifications.md item 5. This
 * keeps the weighted average consistent with "the sale never happened" rather than valuing
 * the return at whatever the price is today.
 */
@Injectable()
export class SalesReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly costingRegistry: CostingStrategyRegistry,
    private readonly customerLedger: CustomerLedgerService,
  ) {}

  async list(query: ListSalesReturnsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SalesReturnWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesInvoiceId ? { salesInvoiceId: query.salesInvoiceId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.salesReturn.findMany({
        where,
        include: INCLUDE,
        orderBy: { returnDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salesReturn.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const salesReturn = await this.prisma.salesReturn.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!salesReturn) throw new NotFoundException('Sales return not found');
    return salesReturn;
  }

  async findForPdf(id: string) {
    const salesReturn = await this.findOrThrow(id);
    const creator = await this.prisma.user.findUnique({
      where: { id: salesReturn.createdByUserId },
      select: { fullName: true, email: true },
    });

    return {
      ...salesReturn,
      preparedByName: creator?.fullName || creator?.email || 'Unknown User',
    };
  }

  async create(dto: CreateSalesReturnDto, actorId: string) {
    const strategy = await this.costingRegistry.resolve();

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findUnique({
        where: { id: dto.salesInvoiceId },
        include: { items: true },
      });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (invoice.status !== SalesInvoiceStatus.FINALIZED) {
        throw new ConflictException(
          'Returns can only be made against a finalized sales invoice',
        );
      }

      const returnNumber = await this.numbering.nextNumber(
        tx,
        DocumentType.SALES_RETURN,
      );
      const salesReturn = await tx.salesReturn.create({
        data: {
          returnNumber,
          salesInvoiceId: invoice.id,
          customerId: invoice.customerId,
          totalAmount: 0,
          reason: dto.reason,
          createdByUserId: actorId,
        },
      });

      let totalAmount = ZERO;

      for (const returnItem of dto.items) {
        const invoiceItem = invoice.items.find(
          (i) => i.id === returnItem.salesInvoiceItemId,
        );
        if (!invoiceItem)
          throw new BadRequestException(
            `Item ${returnItem.salesInvoiceItemId} does not belong to this invoice`,
          );

        const quantity = new Prisma.Decimal(returnItem.quantity);
        const alreadyReturned = await tx.salesReturnItem.aggregate({
          where: { salesInvoiceItemId: invoiceItem.id },
          _sum: { quantity: true },
        });
        const remaining = invoiceItem.quantity.minus(
          alreadyReturned._sum.quantity ?? ZERO,
        );
        if (quantity.greaterThan(remaining)) {
          throw new BadRequestException(
            `Cannot return ${quantity.toString()} of ${invoiceItem.productId} — only ${remaining.toString()} remain returnable on this invoice line`,
          );
        }

        const amount = quantity.times(invoiceItem.rate);
        totalAmount = totalAmount.plus(amount);

        const recordedWidth =
          returnItem.sizeOption &&
          returnItem.sizeOption !== 'FIX' &&
          returnItem.sizeOption !== 'SELF'
            ? Number(returnItem.sizeOption)
            : returnItem.width;

        const createdReturnItem = await tx.salesReturnItem.create({
          data: {
            salesReturnId: salesReturn.id,
            salesInvoiceItemId: invoiceItem.id,
            productId: invoiceItem.productId,
            description: returnItem.description,
            sizeOption: returnItem.sizeOption,
            pieces: returnItem.pieces,
            width: recordedWidth,
            length: returnItem.length,
            usableWidth: returnItem.usableWidth,
            usableLength: returnItem.usableLength,
            quantity,
            rate: invoiceItem.rate,
            amount,
          },
        });

        const saleMovement = await tx.inventoryMovement.findFirst({
          where: {
            salesInvoiceItemId: invoiceItem.id,
            movementType: MovementType.SALE,
          },
        });
        const unitCost =
          saleMovement?.unitCost ??
          (await strategy.getCurrentUnitCost(
            tx,
            invoiceItem.productId,
            invoice.locationId,
          ));

        await strategy.recordReceipt(tx, {
          productId: invoiceItem.productId,
          locationId: invoice.locationId,
          quantity,
          unitCost,
        });

        await tx.inventoryMovement.create({
          data: {
            productId: invoiceItem.productId,
            locationId: invoice.locationId,
            movementType: MovementType.RETURN_IN,
            quantity,
            unitCost,
            sourceType: MovementSourceType.SALES_RETURN,
            salesReturnItemId: createdReturnItem.id,
            remarks: `Return ${returnNumber} against invoice ${invoice.invoiceNumber}`,
            createdByUserId: actorId,
          },
        });

        await tx.inventoryBalance.upsert({
          where: {
            productId_locationId: {
              productId: invoiceItem.productId,
              locationId: invoice.locationId,
            },
          },
          create: {
            productId: invoiceItem.productId,
            locationId: invoice.locationId,
            quantity,
          },
          update: { quantity: { increment: quantity } },
        });
      }

      await tx.salesReturn.update({
        where: { id: salesReturn.id },
        data: { totalAmount },
      });

      await this.customerLedger.postEntry(tx, {
        customerId: invoice.customerId,
        entryType: CustomerLedgerEntryType.RETURN,
        amount: totalAmount.negated(),
        salesReturnId: salesReturn.id,
        description: `Sales return ${returnNumber} against invoice ${invoice.invoiceNumber}`,
        createdByUserId: actorId,
      });

      await this.transactions.record(tx, {
        transactionType: TransactionType.SALES_RETURN,
        amount: totalAmount.negated(),
        description: `Sales return ${returnNumber}`,
        referenceType: 'SalesReturn',
        referenceId: salesReturn.id,
        customerId: invoice.customerId,
        createdByUserId: actorId,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'SalesReturn',
          entityId: salesReturn.id,
          afterData: { ...salesReturn, totalAmount, items: dto.items },
        },
        tx,
      );

      return tx.salesReturn.findUniqueOrThrow({
        where: { id: salesReturn.id },
        include: INCLUDE,
      });
    });
  }
}
