import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, Prisma, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../numbering/numbering.service';
import { QuotationEngineService } from '../quotation-engine/quotation-engine.service';
import { paginate } from '../common/pagination.dto';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { ListQuotationsQueryDto } from './dto/list-quotations-query.dto';
import { RejectQuotationDto } from './dto/reject-quotation.dto';

const INCLUDE = {
  customer: true,
  profile: true,
  items: { include: { product: true }, orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly engine: QuotationEngineService,
  ) {}

  async list(query: ListQuotationsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.QuotationWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo ? { quotationDate: { gte: query.dateFrom, lte: query.dateTo } } : {}),
      ...(query.search
        ? {
            OR: [
              { quotationNumber: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        include: INCLUDE,
        orderBy: { quotationDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id }, include: INCLUDE });
    if (!quotation) throw new NotFoundException('Quotation not found');
    return quotation;
  }

  private async resolveProfile(calculationProfileId: string | undefined) {
    const profile = calculationProfileId
      ? await this.prisma.quotationCalculationProfile.findUnique({ where: { id: calculationProfileId } })
      : await this.prisma.quotationCalculationProfile.findFirst({ where: { isActive: true, isDefault: true } });
    if (!profile) throw new BadRequestException('No active quotation calculation profile found');
    if (!profile.isActive) throw new BadRequestException('This calculation profile is inactive');
    return profile;
  }

  private computeItems(profile: { strategyKey: string; parameters: Prisma.JsonValue }, items: CreateQuotationDto['items']) {
    const parameters = (profile.parameters ?? {}) as Record<string, unknown>;
    return items.map((item) => {
      const result = this.engine.calculate(profile.strategyKey, parameters, {
        sizeOption: item.sizeOption,
        quantity: item.quantity,
        width: item.width,
        length: item.length,
        sqft: item.sqft,
        rate: item.rate,
      });
      return { item, result };
    });
  }

  /** Everything the client actually typed for this line, regardless of which fields the
   * chosen strategy/mode actually used — kept in full so the line can be redisplayed or
   * re-edited exactly as entered. */
  private rawInputParameters(item: CreateQuotationDto['items'][number]): Prisma.InputJsonValue {
    return {
      description: item.description ?? null,
      locationId: item.locationId ?? null,
      sizeOption: item.sizeOption ?? null,
      quantity: item.quantity ?? null,
      width: item.width ?? null,
      length: item.length ?? null,
      sqft: item.sqft ?? null,
      rate: item.rate,
    };
  }

  async create(dto: CreateQuotationDto, actorId: string) {
    const profile = await this.resolveProfile(dto.calculationProfileId);
    const computed = this.computeItems(profile, dto.items);
    const subtotal = computed.reduce((sum, c) => sum + c.result.amount, 0);
    const discountAmount = dto.discountAmount ?? 0;
    const totalAmount = subtotal - discountAmount;
    const advanceReceived = dto.advanceReceived ?? 0;
    if (totalAmount < 0) throw new BadRequestException('Discount cannot exceed the subtotal');
    if (advanceReceived > totalAmount) throw new BadRequestException('Advance received cannot exceed the total amount');

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.findUniqueOrThrow({ where: { id: dto.customerId } });

      const quotationNumber = await this.numbering.nextNumber(tx, DocumentType.QUOTATION);
      const quotation = await tx.quotation.create({
        data: {
          quotationNumber,
          customerId: dto.customerId,
          calculationProfileId: profile.id,
          calculationSnapshot: { strategyKey: profile.strategyKey, parameters: profile.parameters } as Prisma.InputJsonValue,
          subtotal,
          discountAmount,
          totalAmount,
          advanceReceived,
          validUntil: dto.validUntil,
          notes: dto.notes,
          createdByUserId: actorId,
        },
      });

      for (let i = 0; i < computed.length; i++) {
        const { item, result } = computed[i];
        await tx.quotationItem.create({
          data: {
            quotationId: quotation.id,
            productId: item.productId,
            inputParameters: this.rawInputParameters(item),
            computedQuantity: result.quantity,
            computedRate: result.rate,
            computedAmount: result.amount,
            sortOrder: item.sortOrder ?? i,
          },
        });
      }

      await this.audit.log(
        { userId: actorId, action: 'CREATE', entityType: 'Quotation', entityId: quotation.id, afterData: { ...quotation, items: dto.items } },
        tx,
      );

      return tx.quotation.findUniqueOrThrow({ where: { id: quotation.id }, include: INCLUDE });
    });
  }

  async update(id: string, dto: UpdateQuotationDto, actorId: string) {
    const existing = await this.findOrThrow(id);
    if (existing.status !== QuotationStatus.DRAFT) {
      throw new ConflictException('Only draft quotations can be edited');
    }

    const profile = await this.resolveProfile(dto.calculationProfileId ?? existing.calculationProfileId);
    const computed = this.computeItems(profile, dto.items);
    const subtotal = computed.reduce((sum, c) => sum + c.result.amount, 0);
    const discountAmount = dto.discountAmount ?? 0;
    const totalAmount = subtotal - discountAmount;
    const advanceReceived = dto.advanceReceived ?? 0;
    if (totalAmount < 0) throw new BadRequestException('Discount cannot exceed the subtotal');
    if (advanceReceived > totalAmount) throw new BadRequestException('Advance received cannot exceed the total amount');

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.findUniqueOrThrow({ where: { id: dto.customerId } });
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });

      const updated = await tx.quotation.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          calculationProfileId: profile.id,
          calculationSnapshot: { strategyKey: profile.strategyKey, parameters: profile.parameters } as Prisma.InputJsonValue,
          subtotal,
          discountAmount,
          totalAmount,
          advanceReceived,
          validUntil: dto.validUntil,
          notes: dto.notes,
        },
      });

      for (let i = 0; i < computed.length; i++) {
        const { item, result } = computed[i];
        await tx.quotationItem.create({
          data: {
            quotationId: id,
            productId: item.productId,
            inputParameters: this.rawInputParameters(item),
            computedQuantity: result.quantity,
            computedRate: result.rate,
            computedAmount: result.amount,
            sortOrder: item.sortOrder ?? i,
          },
        });
      }

      await this.audit.log(
        { userId: actorId, action: 'UPDATE', entityType: 'Quotation', entityId: id, beforeData: existing, afterData: { ...updated, items: dto.items } },
        tx,
      );

      return tx.quotation.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
  }

  async approve(id: string, actorId: string) {
    const existing = await this.findOrThrow(id);
    const approvable: QuotationStatus[] = [QuotationStatus.DRAFT, QuotationStatus.SENT];
    if (!approvable.includes(existing.status)) {
      throw new ConflictException(`Cannot approve a quotation in ${existing.status} status`);
    }

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.APPROVED, approvedByUserId: actorId, approvedAt: new Date() },
      include: INCLUDE,
    });
    await this.audit.log({ userId: actorId, action: 'APPROVE', entityType: 'Quotation', entityId: id, beforeData: { status: existing.status }, afterData: { status: 'APPROVED' } });
    return updated;
  }

  async reject(id: string, dto: RejectQuotationDto, actorId: string) {
    const existing = await this.findOrThrow(id);
    const rejectable: QuotationStatus[] = [QuotationStatus.DRAFT, QuotationStatus.SENT, QuotationStatus.APPROVED];
    if (!rejectable.includes(existing.status)) {
      throw new ConflictException(`Cannot reject a quotation in ${existing.status} status`);
    }

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        status: QuotationStatus.REJECTED,
        notes: dto.reason ? `${existing.notes ? existing.notes + '\n' : ''}Rejected: ${dto.reason}` : existing.notes,
      },
      include: INCLUDE,
    });
    await this.audit.log({
      userId: actorId,
      action: 'REJECT',
      entityType: 'Quotation',
      entityId: id,
      beforeData: { status: existing.status },
      afterData: { status: 'REJECTED', reason: dto.reason },
    });
    return updated;
  }

  async remove(id: string, actorId: string) {
    const existing = await this.findOrThrow(id);
    if (existing.status !== QuotationStatus.DRAFT) {
      throw new ConflictException('Only draft quotations can be deleted');
    }
    await this.prisma.quotation.delete({ where: { id } });
    await this.audit.log({ userId: actorId, action: 'DELETE', entityType: 'Quotation', entityId: id, beforeData: existing });
  }
}
