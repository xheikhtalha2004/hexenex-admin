import { Injectable } from '@nestjs/common';
import { PermissionEffect } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.permission.findMany({ orderBy: [{ groupName: 'asc' }, { key: 'asc' }] });
  }

  /** Role permissions, plus per-user GRANT overrides, minus per-user DENY overrides. */
  async getEffectivePermissions(userId: string): Promise<Set<string>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        userPermissions: { include: { permission: true } },
      },
    });
    if (!user) return new Set();

    const effective = new Set<string>(user.role.rolePermissions.map((rp) => rp.permission.key));
    for (const up of user.userPermissions) {
      if (up.effect === PermissionEffect.GRANT) effective.add(up.permission.key);
      if (up.effect === PermissionEffect.DENY) effective.delete(up.permission.key);
    }
    return effective;
  }

  async setRolePermissions(roleId: string, permissionKeys: string[]) {
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissions.length === 0) return [];
      return tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      });
    });
  }

  async setUserPermissionOverride(
    userId: string,
    permissionKey: string,
    effect: PermissionEffect,
    grantedByUserId: string,
  ) {
    const permission = await this.prisma.permission.findUniqueOrThrow({ where: { key: permissionKey } });
    return this.prisma.userPermission.upsert({
      where: { userId_permissionId: { userId, permissionId: permission.id } },
      create: { userId, permissionId: permission.id, effect, grantedByUserId },
      update: { effect, grantedByUserId, grantedAt: new Date() },
    });
  }

  async clearUserPermissionOverride(userId: string, permissionKey: string) {
    const permission = await this.prisma.permission.findUniqueOrThrow({ where: { key: permissionKey } });
    await this.prisma.userPermission.deleteMany({ where: { userId, permissionId: permission.id } });
  }
}
