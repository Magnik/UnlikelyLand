import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  LoginSchema,
  RefreshSchema,
  RegisterSchema,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from '@unlikelyland/contracts';
import { Public } from '../common/public.decorator';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { AuthService } from './auth.service';

@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Per-IP throttle blunts credential stuffing / signup spam (10 / 15 min).
  @Public()
  @RateLimit({ limit: 10, windowMs: 15 * 60 * 1000, key: 'auth:register' })
  @Post('register')
  register(@Body(new ZodBody(RegisterSchema)) dto: RegisterInput) {
    return this.auth.register(dto);
  }

  // Throttled per source identity AND per target username (bodyKey), so a single
  // account can't be brute-forced even from many IPs — important because the proxy
  // topology collapses client IPs into one upstream address.
  @Public()
  @RateLimit({ limit: 10, windowMs: 15 * 60 * 1000, key: 'auth:login', bodyKey: 'username' })
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodBody(LoginSchema)) dto: LoginInput) {
    return this.auth.login(dto);
  }

  // Exchange a refresh token for a fresh access token pair (per-IP throttled).
  @Public()
  @RateLimit({ limit: 60, windowMs: 15 * 60 * 1000, key: 'auth:refresh' })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodBody(RefreshSchema)) dto: RefreshInput) {
    return this.auth.refresh(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { id: user.userId, username: user.username, role: user.role };
  }

  // Logout bumps the user's token version, invalidating every outstanding access
  // and refresh token (logout-everywhere). The client also drops its local tokens.
  @Post('logout')
  @HttpCode(204)
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logout(user.userId);
  }
}
