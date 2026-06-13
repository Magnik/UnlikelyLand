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
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const character = await this.prisma.character.findUnique({
      where: { userId: payload.sub },
      select: { id: true },
    });
    if (!character) {
      throw new UnauthorizedException('No character for this account');
    }

    request.user = {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      characterId: character.id,
    };
    return true;
  }
}
