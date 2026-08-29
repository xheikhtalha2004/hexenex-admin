import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword, hashPassword } from '../common/password.util';

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta): Promise<TokenPair & { userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const tokens = await this.issueTokenPair(user.id, randomUUID(), meta);
    return { ...tokens, userId: user.id };
  }

  async refresh(rawRefreshToken: string | undefined, meta: RequestMeta): Promise<TokenPair & { userId: string }> {
    if (!rawRefreshToken) throw new UnauthorizedException('No refresh token provided');

    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) throw new UnauthorizedException('Invalid refresh token');

    if (existing.revokedAt) {
      // Token reuse: this exact rotated-out token was presented again — treat as
      // potential theft and kill the whole session chain, not just this token.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: existing.userId } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const tokens = await this.prisma.$transaction(async (tx) => {
      const next = await this.issueTokenPair(user.id, existing.familyId, meta, tx);
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenId: next.refreshTokenId },
      });
      return next;
    });

    return { ...tokens, userId: user.id };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueTokenPair(
    userId: string,
    familyId: string,
    meta: RequestMeta,
    tx: PrismaService | any = this.prisma,
  ): Promise<TokenPair & { refreshTokenId: string }> {
    const accessToken = this.jwt.sign(
      { sub: userId },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET')!,
        expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as any,
      },
    );

    const rawRefreshToken = randomBytes(48).toString('hex');
    const ttlDays = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? '30');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const refreshTokenRow = await tx.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawRefreshToken),
        familyId,
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt: expiresAt,
      refreshTokenId: refreshTokenRow.id,
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
