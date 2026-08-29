import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

const SETTINGS_ID = 'default';

@Injectable()
export class CompanySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const existing = await this.prisma.companySettings.findUnique({ where: { id: SETTINGS_ID } });
    if (existing) return existing;
    return this.prisma.companySettings.create({
      data: { id: SETTINGS_ID, companyName: 'My Company' },
    });
  }

  async update(data: Prisma.CompanySettingsUpdateInput) {
    await this.get();
    return this.prisma.companySettings.update({ where: { id: SETTINGS_ID }, data });
  }
}
