import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

type TxClient = Prisma.TransactionClient;

export interface AuditLogParams {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeData: toJson(params.beforeData),
        afterData: toJson(params.afterData),
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * AuditLog.userId is a plain scalar (see the schema header note — no FK, so a deleted user
   * doesn't orphan-cascade audit history). Names are joined in application code instead.
   */
  async list(query: ListAuditLogsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.dateFrom || query.dateTo ? { createdAt: { gte: query.dateFrom, lte: query.dateTo } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const userIds = [...new Set(data.map((d) => d.userId).filter((id): id is string => !!id))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } }) : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const enriched = data.map((log) => ({ ...log, user: log.userId ? userById.get(log.userId) ?? null : null }));

    return paginate(enriched, total, page, pageSize);
  }

  distinctEntityTypes() {
    return this.prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value));
}
