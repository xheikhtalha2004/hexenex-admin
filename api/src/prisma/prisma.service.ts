import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    let url = process.env.DATABASE_URL;
    if (url) {
      // Strip any wrapping quotes passed by hosting panel
      url = url.replace(/^['"]|['"]$/g, '').trim();
    }
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (e: any) {
      console.warn('Prisma initial $connect deferred:', e?.message || e);
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (_) {}
  }
}
