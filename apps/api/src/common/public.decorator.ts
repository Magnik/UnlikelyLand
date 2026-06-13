import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@unlikelyland/contracts';

/** Marks a route as not requiring authentication (skips the global AuthGuard). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to one of the given roles (enforced by RolesGuard). */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
