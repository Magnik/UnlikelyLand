import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@unlikelyland/contracts';

/** The authenticated principal attached to the request by AuthGuard. */
export interface AuthUser {
  userId: string;
  username: string;
  role: UserRole;
  characterId: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as AuthUser;
});
