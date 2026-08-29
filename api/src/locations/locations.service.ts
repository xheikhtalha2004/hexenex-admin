import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive = true) {
    return this.prisma.location.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOrThrow(id: string) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async create(dto: CreateLocationDto, actorId: string) {
    const existing = await this.prisma.location.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A location with this name already exists');

    const location = await this.prisma.location.create({ data: dto });
    await this.audit.log({ userId: actorId, action: 'CREATE', entityType: 'Location', entityId: location.id, afterData: location });
    return location;
  }

  async update(id: string, dto: UpdateLocationDto, actorId: string) {
    const before = await this.findOrThrow(id);
    const after = await this.prisma.location.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entityType: 'Location', entityId: id, beforeData: before, afterData: after });
    return after;
  }
}
