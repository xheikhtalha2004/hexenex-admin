import { Injectable } from '@nestjs/common';
import { MovementType, Prisma, QuotationStatus, SalesInvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination.dto';
import { ReportDateRangeQueryDto } from './dto/report-date-range-query.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

const ZERO = new Prisma.Decimal(0);
/** Intermediate costing math carries 4dp precision (unit costs); final report figures are
 * currency and must round to 2dp before display, same as every other money field in the app. */
const round2 = (value: Prisma.Decimal) => value.toDecimalPlaces(2);

export interface ProductPnlRow {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  quantitySold: Prisma.Decimal;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  marginPct: number;
}

/**
 * Product-wise P&L and the company P&L both net sales returns against their OWN date, not
 * retroactively against the original invoice's period — standard practice, and the only
 * sane behavior when a sale and its return fall in different reporting periods.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async productPnl(query: ReportDateRangeQueryDto) {
    const dateFilter = this.dateFilter(query);

    const invoiceItems = await this.prisma.salesInvoiceItem.findMany({
      where: { salesInvoice: { status: SalesInvoiceStatus.FINALIZED, invoiceDate: dateFilter } },
      select: { id: true, productId: true, quantity: true, amount: true },
    });
    const saleMovements = await this.prisma.inventoryMovement.findMany({
      where: { movementType: MovementType.SALE, salesInvoiceItemId: { in: invoiceItems.map((i) => i.id) } },
      select: { salesInvoiceItemId: true, unitCost: true },
    });
    const saleCostByItemId = new Map(saleMovements.map((m) => [m.salesInvoiceItemId as string, m.unitCost ?? ZERO]));

    const returnItems = await this.prisma.salesReturnItem.findMany({
      where: { salesReturn: { returnDate: dateFilter } },
      select: { id: true, productId: true, quantity: true, amount: true },
    });
    const returnMovements = await this.prisma.inventoryMovement.findMany({
      where: { movementType: MovementType.RETURN_IN, salesReturnItemId: { in: returnItems.map((i) => i.id) } },
      select: { salesReturnItemId: true, unitCost: true },
    });
    const returnCostByItemId = new Map(returnMovements.map((m) => [m.salesReturnItemId as string, m.unitCost ?? ZERO]));

    const products = await this.prisma.product.findMany({ include: { category: true } });
    const productById = new Map(products.map((p) => [p.id, p]));

    interface Accumulator {
      quantitySold: Prisma.Decimal;
      revenue: Prisma.Decimal;
      cost: Prisma.Decimal;
    }
    const byProduct = new Map<string, Accumulator>();
    const get = (productId: string): Accumulator => {
      let acc = byProduct.get(productId);
      if (!acc) {
        acc = { quantitySold: ZERO, revenue: ZERO, cost: ZERO };
        byProduct.set(productId, acc);
      }
      return acc;
    };

    for (const item of invoiceItems) {
      const acc = get(item.productId);
      acc.quantitySold = acc.quantitySold.plus(item.quantity);
      acc.revenue = acc.revenue.plus(item.amount);
      const unitCost = saleCostByItemId.get(item.id) ?? ZERO;
      acc.cost = acc.cost.plus(item.quantity.times(unitCost));
    }
    for (const item of returnItems) {
      const acc = get(item.productId);
      acc.quantitySold = acc.quantitySold.minus(item.quantity);
      acc.revenue = acc.revenue.minus(item.amount);
      const unitCost = returnCostByItemId.get(item.id) ?? ZERO;
      acc.cost = acc.cost.minus(item.quantity.times(unitCost));
    }

    const rows: ProductPnlRow[] = [];
    for (const [productId, acc] of byProduct.entries()) {
      const product = productById.get(productId);
      if (!product) continue;
      const grossProfit = acc.revenue.minus(acc.cost);
      rows.push({
        productId,
        productName: product.name,
        categoryId: product.categoryId,
        categoryName: product.category.name,
        quantitySold: acc.quantitySold,
        revenue: round2(acc.revenue),
        cost: round2(acc.cost),
        grossProfit: round2(grossProfit),
        marginPct: acc.revenue.isZero() ? 0 : grossProfit.dividedBy(acc.revenue).times(100).toNumber(),
      });
    }
    rows.sort((a, b) => b.revenue.comparedTo(a.revenue));

    const totals = rows.reduce(
      (sum, row) => ({
        revenue: sum.revenue.plus(row.revenue),
        cost: sum.cost.plus(row.cost),
        grossProfit: sum.grossProfit.plus(row.grossProfit),
      }),
      { revenue: ZERO, cost: ZERO, grossProfit: ZERO },
    );

    const categoryTotals = new Map<string, { categoryName: string; revenue: Prisma.Decimal; cost: Prisma.Decimal; grossProfit: Prisma.Decimal }>();
    for (const row of rows) {
      const existing = categoryTotals.get(row.categoryId) ?? {
        categoryName: row.categoryName,
        revenue: ZERO,
        cost: ZERO,
        grossProfit: ZERO,
      };
      existing.revenue = existing.revenue.plus(row.revenue);
      existing.cost = existing.cost.plus(row.cost);
      existing.grossProfit = existing.grossProfit.plus(row.grossProfit);
      categoryTotals.set(row.categoryId, existing);
    }

    return {
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      products: rows,
      categoryTotals: Array.from(categoryTotals.entries()).map(([categoryId, t]) => ({ categoryId, ...t })),
      totals: {
        ...totals,
        marginPct: totals.revenue.isZero() ? 0 : totals.grossProfit.dividedBy(totals.revenue).times(100).toNumber(),
      },
    };
  }

  async companyPnl(query: ReportDateRangeQueryDto) {
    const pnl = await this.productPnl(query);
    const dateFilter = this.dateFilter(query);

    const expenseAgg = await this.prisma.expense.aggregate({
      where: { expenseDate: dateFilter },
      _sum: { amount: true },
    });
    const totalExpenses = round2(expenseAgg._sum.amount ?? ZERO);
    const netProfit = round2(pnl.totals.grossProfit.minus(totalExpenses));

    return {
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      totalRevenue: pnl.totals.revenue,
      totalCost: pnl.totals.cost,
      grossProfit: pnl.totals.grossProfit,
      totalExpenses,
      netProfit,
    };
  }

  async transactions(query: ListTransactionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.TransactionWhereInput = {
      ...(query.transactionType ? { transactionType: query.transactionType } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.search ? { description: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.dateFrom || query.dateTo ? { transactionDate: { gte: query.dateFrom, lte: query.dateTo } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    // Transaction is deliberately FK-free (see schema comment), so the Customer/Party column
    // (RPT-01) is resolved here with two small batch lookups rather than a Prisma relation.
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id))];
    const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((id): id is string => !!id))];
    const partyEmpty: { id: string; name: string }[] = [];
    const [customers, suppliers] = await Promise.all([
      customerIds.length
        ? this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })
        : partyEmpty,
      supplierIds.length
        ? this.prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
        : partyEmpty,
    ]);
    const customerNames = new Map<string, string>(customers.map((c): [string, string] => [c.id, c.name]));
    const supplierNames = new Map<string, string>(suppliers.map((s): [string, string] => [s.id, s.name]));

    const data = rows.map((r) => {
      const partyName: string | null =
        (r.customerId ? customerNames.get(r.customerId) : undefined) ??
        (r.supplierId ? supplierNames.get(r.supplierId) : undefined) ??
        null;
      return { ...r, partyName };
    });

    return paginate(data, total, page, pageSize);
  }

  /**
   * DSH-03: what the owner still needs to act on. Deliberately not a stored notification —
   * it is derived live from status each time it's requested, so a completed item simply stops
   * matching the query (nothing to mark read) and nothing can ever be duplicated.
   */
  async pendingActions() {
    const [approvedQuotations, draftInvoices] = await Promise.all([
      this.prisma.quotation.findMany({
        where: { status: QuotationStatus.APPROVED, convertedInvoice: null },
        include: { customer: true },
        orderBy: { quotationDate: 'asc' },
        take: 20,
      }),
      this.prisma.salesInvoice.findMany({
        where: { status: SalesInvoiceStatus.DRAFT },
        include: { customer: true },
        orderBy: { invoiceDate: 'asc' },
        take: 20,
      }),
    ]);

    const actions = [
      ...approvedQuotations.map((q) => ({
        id: `quotation-${q.id}`,
        action: `Convert quotation ${q.quotationNumber} to an invoice`,
        customerName: q.customer.name,
        date: q.quotationDate,
        href: '/quotations',
      })),
      ...draftInvoices.map((inv) => ({
        id: `invoice-${inv.id}`,
        action: `Finalize and send invoice ${inv.invoiceNumber}`,
        customerName: inv.customer.name,
        date: inv.invoiceDate,
        href: '/sales-invoices',
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return { actions };
  }

  async customerOutstanding() {
    const customers = await this.prisma.customer.findMany({
      where: { currentBalance: { not: 0 } },
      orderBy: { currentBalance: 'desc' },
      select: { id: true, name: true, phone: true, currentBalance: true, isActive: true },
    });
    const totalOutstanding = customers.reduce((sum, c) => sum.plus(c.currentBalance), ZERO);
    return { customers, totalOutstanding };
  }

  async supplierPayable() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { currentBalance: { not: 0 } },
      orderBy: { currentBalance: 'desc' },
      select: { id: true, name: true, phone: true, currentBalance: true, isActive: true },
    });
    const totalPayable = suppliers.reduce((sum, s) => sum.plus(s.currentBalance), ZERO);
    return { suppliers, totalPayable };
  }

  /** Current stock valued at each product/location's weighted-average cost. */
  async inventoryValue() {
    const costs = await this.prisma.productCost.findMany({
      select: { quantityOnHandMirror: true, weightedAverageCost: true },
    });
    const totalValue = costs.reduce((sum, c) => sum.plus(c.quantityOnHandMirror.times(c.weightedAverageCost)), ZERO);
    return { totalValue: round2(totalValue) };
  }

  private dateFilter(query: ReportDateRangeQueryDto) {
    if (!query.dateFrom && !query.dateTo) return undefined;
    return { gte: query.dateFrom, lte: query.dateTo };
  }
}
