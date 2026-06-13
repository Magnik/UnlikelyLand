import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@unlikelyland/contracts';
import { ROLES_KEY } from './public.decorator';
import type { AuthUser } from './current-user.decorator';

/**
 * Role gate for admin/moderator routes. Runs after AuthGuard, so request.user
 * is present. Routes declare requirements with @Roles('admin'). 'admin' is a
 * superset of 'moderator' for convenience.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Not authenticated');

    const allowed = required.some((r) => r === user.role) || user.role === 'admin';
    if (!allowed) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
