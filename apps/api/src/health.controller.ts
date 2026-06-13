import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';

/**
 * Liveness endpoints. Intentionally do NOT touch the database so the container
 * health check stays green during migrations/transient DB blips. Public.
 */
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'unlikelyland-api', time: new Date().toISOString() };
  }

  @Public()
  @Get()
  root() {
    return { name: 'UnlikelyLand API', docs: 'POST /auth/register to begin' };
  }
}
