import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  LoginSchema,
  RegisterSchema,
  type LoginInput,
  type RegisterInput,
} from '@unlikelyland/contracts';
import { Public } from '../common/public.decorator';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { ZodBody } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body(new ZodBody(RegisterSchema)) dto: RegisterInput) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodBody(LoginSchema)) dto: LoginInput) {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { id: user.userId, username: user.username, role: user.role };
  }

  // Logout is client-side for stateless JWT (drop the token). Endpoint exists
  // for symmetry and future server-side revocation.
  @Post('logout')
  @HttpCode(204)
  logout() {
    return;
  }
}
