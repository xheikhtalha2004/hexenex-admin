import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/password.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        roleId: true,
        role: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true, userPermissions: { include: { permission: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, include: { role: true } });
  }

  async create(params: { email: string; password: string; fullName: string; phone?: string; roleId: string }) {
    const existing = await this.findByEmail(params.email);
    if (existing) throw new ConflictException('A user with this email already exists');

    const passwordHash = await hashPassword(params.password);
    return this.prisma.user.create({
      data: {
        email: params.email,
        passwordHash,
        fullName: params.fullName,
        phone: params.phone,
        roleId: params.roleId,
      },
      select: { id: true, email: true, fullName: true, status: true, roleId: true },
    });
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.findById(id);
    return this.prisma.user.update({ where: { id }, data: { status } });
  }

  async updateRole(id: string, roleId: string) {
    await this.findById(id);
    return this.prisma.user.update({ where: { id }, data: { roleId } });
  }

  async setPassword(id: string, newPassword: string) {
    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const passwordHash = await hashPassword(newPassword);
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
