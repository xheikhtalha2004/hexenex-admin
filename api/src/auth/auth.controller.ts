import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { RequestUser } from './types/request-user';
import { PermissionsService } from '../iam/permissions.service';

const REFRESH_COOKIE_NAME = 'refresh_token';
// Must match the mounted path of this controller including the global 'api' prefix
// (see main.ts setGlobalPrefix) — otherwise the browser never sends the cookie back.
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
    private readonly config: ConfigService,
  ) {}

  // Independent bucket from the global 120/60s default (nestjs-throttler keys storage per
  // handler, not just per throttler name) — login needs a much tighter limit for brute-force
  // resistance than ordinary API traffic, without either budget stealing from the other.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto.email, dto.password, this.meta(req));
    this.setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    const tokens = await this.authService.refresh(raw, this.meta(req));
    this.setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(raw);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    const permissions = await this.permissionsService.getEffectivePermissions(user.id);
    return { ...user, permissions: Array.from(permissions) };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { success: true };
  }

  private meta(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      // The web app and API are deployed as separate origins (e.g. two Railway services),
      // so the browser treats this as a cross-site request — 'strict'/'lax' would silently
      // stop sending the cookie back at all. 'none' requires secure:true, already true in prod.
      sameSite: isProd ? 'none' : 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }
}
