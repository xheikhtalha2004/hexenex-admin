import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomerLedgerEntryType,
  DocumentType,
  MovementSourceType,
  MovementType,
  Prisma,
  QuotationStatus,
  SalesInvoiceStatus,
  StockShortagePolicy,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NumberingService } from '../numbering/numbering.service';
import { CostingStrategyRegistry } from '../costing/costing-strategy.registry';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { paginate } from '../common/pagination.dto';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { ListSalesInvoicesQueryDto } from './dto/list-sales-invoices-query.dto';
import { CancelSalesInvoiceDto } from './dto/cancel-sales-invoice.dto';
import { CreateFromQuotationDto } from './dto/create-from-quotation.dto';

const ZERO = new Prisma.Decimal(0);

const INCLUDE = {
  customer: true,
  location: true,
  items: { include: { product: true }, orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class SalesInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly costingRegistry: CostingStrategyRegistry,
    private readonly companySettings: CompanySettingsService,
    private readonly customerLedger: CustomerLedgerService,
  ) {}

  async list(query: ListSalesInvoicesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SalesInvoiceWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo ? { invoiceDate: { gte: query.dateFrom, lte: query.dateTo } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where,
        include: INCLUDE,
        orderBy: { invoiceDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const invoice = await this.prisma.salesInvoice.findUnique({ where: { id }, include: INCLUDE });
    if (!invoice) throw new NotFoundException('Sales invoice not found');
    return invoice;
  }

  async create(dto: CreateSalesInvoiceDto, actorId: string) {
    const itemAmounts = dto.items.map((item) => new Prisma.Decimal(item.quantity).times(item.rate));
    const subtotal = itemAmounts.reduce((sum, amount) => sum.plus(amount), ZERO);
    const discountAmount = new Prisma.Decimal(dto.discountAmount ?? 0);
    const totalAmount = subtotal.minus(discountAmount);
    if (totalAmount.isNegative()) throw new BadRequestException('Discount cannot exceed the subtotal');

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.findUniqueOrThrow({ where: { id: dto.customerId } });
      await tx.location.findUniqueOrThrow({ where: { id: dto.locationId } });

      const invoiceNumber = await this.numbering.nextNumber(tx, DocumentType.SALES_INVOICE);
      const invoice = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          customerId: dto.customerId,
          locationId: dto.locationId,
          status: SalesInvoiceStatus.DRAFT,
          sourceQuotationId: dto.sourceQuotationId,
          termsText: dto.termsText,
          deliveryTerms: dto.deliveryTerms,
          deliveryAddress: dto.deliveryAddress,
          expectedDeliveryDate: dto.expectedDeliveryDate,
          subtotal,
          discountAmount,
          totalAmount,
          createdByUserId: actorId,
        },
      });

      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        await tx.salesInvoiceItem.create({
          data: {
            salesInvoiceId: invoice.id,
            productId: item.productId,
            inputParameters: item.inputParameters,
            quantity: item.quantity,
            rate: item.rate,
            amount: itemAmounts[i],
            sortOrder: i,
          } as any,
        });
      }

      await this.audit.log(
        { userId: actorId, action: 'CREATE', entityType: 'SalesInvoice', entityId: invoice.id, afterData: { ...invoice, items: dto.items } },
        tx,
      );

      return tx.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: INCLUDE });
    });
  }

  /**
   * The manual quotation -> invoice step from the master spec: never automatic, always
   * requires an already-APPROVED quotation, and always lands as a DRAFT invoice so staff can
   * still review/edit before finalizing (finalize is what actually touches stock/ledger).
   */
  async createFromQuotation(quotationId: string, dto: CreateFromQuotationDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUnique({ where: { id: quotationId }, include: { items: true } });
      if (!quotation) throw new NotFoundException('Quotation not found');
      if (quotation.status !== QuotationStatus.APPROVED) {
        throw new ConflictException('Only an approved quotation can be converted to a sales invoice');
      }
      const existing = await tx.salesInvoice.findUnique({ where: { sourceQuotationId: quotationId } });
      if (existing) throw new ConflictException('This quotation has already been converted to a sales invoice');

      await tx.location.findUniqueOrThrow({ where: { id: dto.locationId } });

      const invoiceNumber = await this.numbering.nextNumber(tx, DocumentType.SALES_INVOICE);
      const invoice = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          customerId: quotation.customerId,
          locationId: dto.locationId,
          status: SalesInvoiceStatus.DRAFT,
          sourceQuotationId: quotation.id,
          termsText: dto.termsText,
          deliveryTerms: dto.deliveryTerms,
          deliveryAddress: dto.deliveryAddress,
          expectedDeliveryDate: dto.expectedDeliveryDate,
          subtotal: quotation.subtotal,
          discountAmount: quotation.discountAmount,
          totalAmount: quotation.totalAmount,
          createdByUserId: actorId,
        },
      });

      for (let i = 0; i < quotation.items.length; i++) {
        const item = quotation.items[i];
        await tx.salesInvoiceItem.create({
          data: {
            salesInvoiceId: invoice.id,
            productId: item.productId,
            inputParameters: item.inputParameters,
            quantity: item.computedQuantity,
            rate: item.computedRate,
            amount: item.computedAmount,
            sortOrder: i,
          } as any,
        });
      }

      await tx.quotation.update({ where: { id: quotationId }, data: { status: QuotationStatus.CONVERTED } });

      await this.audit.log(
        { userId: actorId, action: 'CONVERT', entityType: 'Quotation', entityId: quotationId, afterData: { convertedToSalesInvoiceId: invoice.id } },
        tx,
      );
      await this.audit.log(
        { userId: actorId, action: 'CREATE', entityType: 'SalesInvoice', entityId: invoice.id, afterData: { ...invoice, sourceQuotationId: quotationId } },
        tx,
      );

      return tx.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: INCLUDE });
    });
  }

  async update(id: string, dto: CreateSalesInvoiceDto, actorId: string) {
    const existing = await this.findOrThrow(id);
    if (existing.status !== SalesInvoiceStatus.DRAFT) {
      throw new ConflictException('Only draft sales invoices can be edited');
    }

    const itemAmounts = dto.items.map((item) => new Prisma.Decimal(item.quantity).times(item.rate));
    const subtotal = itemAmounts.reduce((sum, amount) => sum.plus(amount), ZERO);
    const discountAmount = new Prisma.Decimal(dto.discountAmount ?? 0);
    const totalAmount = subtotal.minus(discountAmount);
    if (totalAmount.isNegative()) throw new BadRequestException('Discount cannot exceed the subtotal');

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.findUniqueOrThrow({ where: { id: dto.customerId } });
      await tx.location.findUniqueOrThrow({ where: { id: dto.locationId } });
      await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: id } });

      const updated = await tx.salesInvoice.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          locationId: dto.locationId,
          termsText: dto.termsText,
          deliveryTerms: dto.deliveryTerms,
          deliveryAddress: dto.deliveryAddress,
          expectedDeliveryDate: dto.expectedDeliveryDate,
          subtotal,
          discountAmount,
          totalAmount,
        },
      });

      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        await tx.salesInvoiceItem.create({
          data: {
            salesInvoiceId: id,
            productId: item.productId,
            inputParameters: item.inputParameters,
            quantity: item.quantity,
            rate: item.rate,
            amount: itemAmounts[i],
            sortOrder: i,
          } as any,
        });
      }

      await this.audit.log(
        { userId: actorId, action: 'UPDATE', entityType: 'SalesInvoice', entityId: id, beforeData: existing, afterData: { ...updated, items: dto.items } },
        tx,
      );

      return tx.salesInvoice.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
  }

  async finalize(id: string, actorId: string) {
    const settings = await this.companySettings.get();
    const strategy = await this.costingRegistry.resolve();

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findUnique({ where: { id }, include: { items: true } });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (invoice.status !== SalesInvoiceStatus.DRAFT) {
        throw new ConflictException(`Sales invoice is already ${invoice.status.toLowerCase()}`);
      }

      for (const item of invoice.items) {
        const balance = await tx.inventoryBalance.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: invoice.locationId } },
        });
        const currentQty = balance?.quantity ?? ZERO;
        if (settings.stockShortagePolicy === StockShortagePolicy.PREVENT_NEGATIVE && currentQty.lessThan(item.quantity)) {
          throw new BadRequestException(`Insufficient stock for product ${item.productId} at this location`);
        }

        const { unitCost } = await strategy.recordConsumption(tx, {
          productId: item.productId,
          locationId: invoice.locationId,
          quantity: item.quantity,
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: invoice.locationId,
            movementType: MovementType.SALE,
            quantity: item.quantity.negated(),
            unitCost,
            movementDate: invoice.invoiceDate,
            sourceType: MovementSourceType.SALES_INVOICE,
            salesInvoiceItemId: item.id,
            createdByUserId: actorId,
          },
        });

        await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: item.productId, locationId: invoice.locationId } },
          create: { productId: item.productId, locationId: invoice.locationId, quantity: item.quantity.negated() },
          update: { quantity: { decrement: item.quantity } },
        });
      }

      await this.customerLedger.postEntry(tx, {
        customerId: invoice.customerId,
        entryType: CustomerLedgerEntryType.INVOICE,
        amount: invoice.totalAmount,
        salesInvoiceId: invoice.id,
        description: `Sales invoice ${invoice.invoiceNumber}`,
        entryDate: invoice.invoiceDate,
        createdByUserId: actorId,
      });

      await this.transactions.record(tx, {
        transactionType: TransactionType.SALES_INVOICE,
        amount: invoice.totalAmount,
        description: `Sales invoice ${invoice.invoiceNumber}`,
        referenceType: 'SalesInvoice',
        referenceId: invoice.id,
        customerId: invoice.customerId,
        createdByUserId: actorId,
        transactionDate: invoice.invoiceDate,
      });

      const finalized = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { status: SalesInvoiceStatus.FINALIZED, finalizedAt: new Date(), finalizedByUserId: actorId },
        include: INCLUDE,
      });

      await this.audit.log(
        { userId: actorId, action: 'FINALIZE', entityType: 'SalesInvoice', entityId: invoice.id, afterData: { status: 'FINALIZED' } },
        tx,
      );

      return finalized;
    });
  }

  async cancel(id: string, dto: CancelSalesInvoiceDto, actorId: string) {
    const strategy = await this.costingRegistry.resolve();

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findUnique({ where: { id }, include: { items: true } });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (invoice.status !== SalesInvoiceStatus.FINALIZED) {
        throw new ConflictException(`Only a finalized sales invoice can be cancelled (current status: ${invoice.status})`);
      }

      // A full cancel reverses the ENTIRE original quantity/amount. If any of it has already
      // been returned, that reversal would double-count — the return already undid those
      // units, so cancelling on top would restore them to stock a second time and double-count
      // the revenue reversal. Returns must be the only reversal path once any exist.
      const existingReturn = await tx.salesReturn.findFirst({ where: { salesInvoiceId: id } });
      if (existingReturn) {
        throw new ConflictException(
          'This invoice already has sales returns against it and cannot be cancelled — process further corrections as returns instead',
        );
      }

      for (const item of invoice.items) {
        const saleMovement = await tx.inventoryMovement.findFirst({
          where: { salesInvoiceItemId: item.id, movementType: MovementType.SALE },
        });
        const unitCost = saleMovement?.unitCost ?? (await strategy.getCurrentUnitCost(tx, item.productId, invoice.locationId));

        await strategy.recordReceipt(tx, {
          productId: item.productId,
          locationId: invoice.locationId,
          quantity: item.quantity,
          unitCost,
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: invoice.locationId,
            movementType: MovementType.RETURN_IN,
            quantity: item.quantity,
            unitCost,
            sourceType: MovementSourceType.SALES_INVOICE,
            salesInvoiceItemId: item.id,
            remarks: `Reversal — invoice ${invoice.invoiceNumber} cancelled`,
            createdByUserId: actorId,
          },
        });

        await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: item.productId, locationId: invoice.locationId } },
          create: { productId: item.productId, locationId: invoice.locationId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
      }

      await this.customerLedger.postEntry(tx, {
        customerId: invoice.customerId,
        entryType: CustomerLedgerEntryType.ADJUSTMENT,
        amount: invoice.totalAmount.negated(),
        salesInvoiceId: invoice.id,
        description: `Cancelled sales invoice ${invoice.invoiceNumber}${dto.reason ? ` — ${dto.reason}` : ''}`,
        createdByUserId: actorId,
      });

      await this.transactions.record(tx, {
        transactionType: TransactionType.SALES_INVOICE,
        amount: invoice.totalAmount.negated(),
        description: `Cancellation of sales invoice ${invoice.invoiceNumber}`,
        referenceType: 'SalesInvoice',
        referenceId: invoice.id,
        customerId: invoice.customerId,
        createdByUserId: actorId,
      });

      const cancelled = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { status: SalesInvoiceStatus.CANCELLED, cancelledAt: new Date(), cancelReason: dto.reason },
        include: INCLUDE,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CANCEL',
          entityType: 'SalesInvoice',
          entityId: invoice.id,
          beforeData: { status: 'FINALIZED' },
          afterData: { status: 'CANCELLED', reason: dto.reason },
        },
        tx,
      );

      return cancelled;
    });
  }
}
