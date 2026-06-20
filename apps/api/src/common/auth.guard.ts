import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@unlikelyland/contracts';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PrismaService } from './prisma.service';

interface JwtPayload {
  sub: string; // userId
  username: string;
  role: UserRole;
  ver?: number; // token version; mismatch ⇒ revoked
}

/**
 * Global authentication guard. Verifies the Bearer JWT, loads the user's
 * character id, and attaches an AuthUser to the request. Routes opt out with
 * the @Public() decorator (login/register/health). The client is never trusted
 * for identity — everything downstream keys off the verified token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();

    let payload: JwtPayload;
    try {
      // Pin the signing algorithm so only our HMAC tokens are ever accepted.
      payload = await this.jwt.verifyAsync<JwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Re-read role + ban state from the DB every request: the JWT claim is never
    // trusted for authorization, so a demotion or ban takes effect immediately
    // (within the token's lifetime) rather than only after it expires.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, bannedAt: true, tokenVersion: true, character: { select: { id: true } } },
    });
    if (!user) throw new UnauthorizedException('Account not found');
    if (user.bannedAt) throw new UnauthorizedException('This account has been suspended');
    // A logout/ban bumps tokenVersion, so a stale access token is rejected at once.
    if ((payload.ver ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session expired — please log in again');
    }
    if (!user.character) throw new UnauthorizedException('No character for this account');

    request.user = {
      userId: payload.sub,
      username: payload.username,
      role: user.role as UserRole,
      characterId: user.character.id,
    };
    return true;
  }
}
