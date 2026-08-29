import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.role.findMany({
      include: { rolePermissions: { include: { permission: true } }, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  create(name: string, description?: string) {
    return this.prisma.role.create({ data: { name, description } });
  }

  async update(id: string, data: { name?: string; description?: string }) {
    await this.findById(id);
    return this.prisma.role.update({ where: { id }, data });
  }

  async delete(id: string) {
    const role = await this.findById(id);
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    return this.prisma.role.delete({ where: { id } });
  }
}
