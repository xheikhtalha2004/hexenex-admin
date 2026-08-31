import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExcelService } from './excel.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ReportDateRangeQueryDto } from './dto/report-date-range-query.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { reportTableHtml } from '../pdf/templates/report-table.template';

function sendExcel(res: Response, buffer: Buffer, filename: string) {
  res.set({
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.send(buffer);
}

function sendHtml(res: Response, html: string) {
  res.set({ 'Content-Type': 'text/html; charset=utf-8' });
  res.send(html);
}

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly excel: ExcelService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  @Get('product-pnl')
  @RequirePermissions('product_pnl.view')
  productPnl(@Query() query: ReportDateRangeQueryDto) {
    return this.reports.productPnl(query);
  }

  @Get('company-pnl')
  @RequirePermissions('company_pnl.view')
  companyPnl(@Query() query: ReportDateRangeQueryDto) {
    return this.reports.companyPnl(query);
  }

  @Get('transactions')
  @RequirePermissions('reports.view')
  transactions(@Query() query: ListTransactionsQueryDto) {
    return this.reports.transactions(query);
  }

  @Get('pending-actions')
  @RequirePermissions('quotation.approve')
  pendingActions() {
    return this.reports.pendingActions();
  }

  @Get('customer-outstanding')
  @RequirePermissions('reports.view')
  customerOutstanding() {
    return this.reports.customerOutstanding();
  }

  @Get('supplier-payable')
  @RequirePermissions('reports.view')
  supplierPayable() {
    return this.reports.supplierPayable();
  }

  @Get('inventory-value')
  @RequirePermissions('reports.view')
  inventoryValue() {
    return this.reports.inventoryValue();
  }

  @Get('product-pnl/excel')
  @RequirePermissions('product_pnl.view', 'reports.export')
  async productPnlExcel(
    @Query() query: ReportDateRangeQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pnl = await this.reports.productPnl(query);
    const buffer = await this.excel.buildWorkbook(
      'Product P&L',
      [
        { header: 'Product', key: 'productName', width: 30 },
        { header: 'Category', key: 'categoryName', width: 22 },
        { header: 'Square Feet Sold', key: 'quantitySold', width: 16 },
        { header: 'Revenue', key: 'revenue', width: 16, money: true },
        { header: 'Cost', key: 'cost', width: 16, money: true },
        { header: 'Gross Profit', key: 'grossProfit', width: 16, money: true },
        { header: 'Margin %', key: 'marginPct', width: 12 },
      ],
      pnl.products.map((p) => ({
        productName: p.productName,
        categoryName: p.categoryName,
        quantitySold: Number(p.quantitySold),
        revenue: Number(p.revenue),
        cost: Number(p.cost),
        grossProfit: Number(p.grossProfit),
        marginPct: Number(p.marginPct.toFixed(1)),
      })),
    );
    return sendExcel(res, buffer, 'product-pnl.xlsx');
  }

  @Get('transactions/excel')
  @RequirePermissions('reports.view', 'reports.export')
  async transactionsExcel(
    @Query() query: ListTransactionsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.transactions({
      ...query,
      page: 1,
      pageSize: 5000,
    });
    const buffer = await this.excel.buildWorkbook(
      'Transactions',
      [
        { header: 'Date', key: 'transactionDate', width: 20 },
        { header: 'Type', key: 'transactionType', width: 22 },
        { header: 'Customer/Party', key: 'partyName', width: 26 },
        { header: 'Description', key: 'description', width: 45 },
        { header: 'Amount', key: 'amount', width: 16, money: true },
      ],
      result.data.map((t) => ({
        transactionDate: new Date(t.transactionDate).toLocaleString(),
        transactionType: t.transactionType.replace(/_/g, ' '),
        partyName: t.partyName ?? '',
        description: t.description,
        amount: Number(t.amount),
      })),
    );
    return sendExcel(res, buffer, 'transactions.xlsx');
  }

  @Get('customer-outstanding/excel')
  @RequirePermissions('reports.view', 'reports.export')
  async customerOutstandingExcel(@Res({ passthrough: true }) res: Response) {
    const result = await this.reports.customerOutstanding();
    const buffer = await this.excel.buildWorkbook(
      'Customer Outstanding',
      [
        { header: 'Customer', key: 'name', width: 30 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'Balance', key: 'currentBalance', width: 16, money: true },
      ],
      result.customers.map((c) => ({
        name: c.name,
        phone: c.phone ?? '',
        currentBalance: Number(c.currentBalance),
      })),
    );
    return sendExcel(res, buffer, 'customer-outstanding.xlsx');
  }

  @Get('supplier-payable/excel')
  @RequirePermissions('reports.view', 'reports.export')
  async supplierPayableExcel(@Res({ passthrough: true }) res: Response) {
    const result = await this.reports.supplierPayable();
    const buffer = await this.excel.buildWorkbook(
      'Supplier Payable',
      [
        { header: 'Supplier', key: 'name', width: 30 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'Balance', key: 'currentBalance', width: 16, money: true },
      ],
      result.suppliers.map((s) => ({
        name: s.name,
        phone: s.phone ?? '',
        currentBalance: Number(s.currentBalance),
      })),
    );
    return sendExcel(res, buffer, 'supplier-payable.xlsx');
  }

  @Get('product-pnl/pdf')
  @RequirePermissions('product_pnl.view', 'reports.export')
  async productPnlPdf(
    @Query() query: ReportDateRangeQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [pnl, company] = await Promise.all([
      this.reports.productPnl(query),
      this.companySettings.get(),
    ]);
    const html = reportTableHtml(
      {
        title: 'Product-wise Profit & Loss',
        generatedLabel: `${query.dateFrom ? new Date(query.dateFrom).toLocaleDateString() : 'All time'} — ${query.dateTo ? new Date(query.dateTo).toLocaleDateString() : 'Present'}`,
        meta: [
          {
            label: 'From',
            value: query.dateFrom
              ? new Date(query.dateFrom).toLocaleDateString()
              : 'All time',
          },
          {
            label: 'To',
            value: query.dateTo
              ? new Date(query.dateTo).toLocaleDateString()
              : 'Present',
          },
          { label: 'Products', value: String(pnl.products.length) },
        ],
        columns: [
          { header: 'Product', key: 'productName' },
          { header: 'Category', key: 'categoryName' },
          { header: 'Square Feet Sold', key: 'quantitySold', align: 'right' },
          { header: 'Revenue', key: 'revenue', money: true },
          { header: 'Cost', key: 'cost', money: true },
          { header: 'Gross Profit', key: 'grossProfit', money: true },
          { header: 'Margin %', key: 'marginPct', align: 'right' },
        ],
        rows: pnl.products.map((p) => ({
          productName: p.productName,
          categoryName: p.categoryName,
          quantitySold: String(p.quantitySold),
          revenue: p.revenue,
          cost: p.cost,
          grossProfit: p.grossProfit,
          marginPct: `${p.marginPct.toFixed(1)}%`,
        })),
      },
      company,
    );
    return sendHtml(res, this.pdf.renderHtml(html));
  }

  @Get('transactions/pdf')
  @RequirePermissions('reports.view', 'reports.export')
  async transactionsPdf(
    @Query() query: ListTransactionsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [result, company] = await Promise.all([
      this.reports.transactions({ ...query, page: 1, pageSize: 5000 }),
      this.companySettings.get(),
    ]);
    const html = reportTableHtml(
      {
        title: 'Central Transaction History',
        generatedLabel: `${result.data.length} entries`,
        meta: [
          {
            label: 'From',
            value: query.dateFrom
              ? new Date(query.dateFrom).toLocaleDateString()
              : 'All time',
          },
          {
            label: 'To',
            value: query.dateTo
              ? new Date(query.dateTo).toLocaleDateString()
              : 'Present',
          },
          { label: 'Entries', value: String(result.data.length) },
        ],
        columns: [
          { header: 'Date', key: 'transactionDate' },
          { header: 'Type', key: 'transactionType' },
          { header: 'Customer/Party', key: 'partyName' },
          { header: 'Description', key: 'description' },
          { header: 'Amount', key: 'amount', money: true },
        ],
        rows: result.data.map((t) => ({
          transactionDate: new Date(t.transactionDate).toLocaleString(),
          transactionType: t.transactionType.replace(/_/g, ' '),
          partyName: t.partyName ?? '',
          description: t.description,
          amount: t.amount,
        })),
      },
      company,
    );
    return sendHtml(res, this.pdf.renderHtml(html));
  }

  @Get('customer-outstanding/pdf')
  @RequirePermissions('reports.view', 'reports.export')
  async customerOutstandingPdf(@Res({ passthrough: true }) res: Response) {
    const [result, company] = await Promise.all([
      this.reports.customerOutstanding(),
      this.companySettings.get(),
    ]);
    const html = reportTableHtml(
      {
        title: 'Customer Outstanding',
        generatedLabel: `${result.customers.length} customers`,
        meta: [{ label: 'Customers', value: String(result.customers.length) }],
        columns: [
          { header: 'Customer', key: 'name' },
          { header: 'Phone', key: 'phone' },
          { header: 'Balance', key: 'currentBalance', money: true },
        ],
        rows: result.customers.map((c) => ({
          name: c.name,
          phone: c.phone ?? '',
          currentBalance: c.currentBalance,
        })),
      },
      company,
    );
    return sendHtml(res, this.pdf.renderHtml(html));
  }

  @Get('supplier-payable/pdf')
  @RequirePermissions('reports.view', 'reports.export')
  async supplierPayablePdf(@Res({ passthrough: true }) res: Response) {
    const [result, company] = await Promise.all([
      this.reports.supplierPayable(),
      this.companySettings.get(),
    ]);
    const html = reportTableHtml(
      {
        title: 'Supplier Payable',
        generatedLabel: `${result.suppliers.length} suppliers`,
        meta: [{ label: 'Suppliers', value: String(result.suppliers.length) }],
        columns: [
          { header: 'Supplier', key: 'name' },
          { header: 'Phone', key: 'phone' },
          { header: 'Balance', key: 'currentBalance', money: true },
        ],
        rows: result.suppliers.map((s) => ({
          name: s.name,
          phone: s.phone ?? '',
          currentBalance: s.currentBalance,
        })),
      },
      company,
    );
    return sendHtml(res, this.pdf.renderHtml(html));
  }
}
