import 'reflect-metadata';
import type { ServerResponse } from 'node:http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppConfig } from './common/config';

/** Largest request body we ever accept. Every text field is zod-capped well below
 *  this, so a small global cap is safe and stops oversized bodies before parsing. */
const BODY_LIMIT = '64kb';

async function bootstrap(): Promise<void> {
  // Body parsing is configured explicitly so we can cap the payload size.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { extended: true, limit: BODY_LIMIT });
  const config = app.get(AppConfig);
  const logger = new Logger('Bootstrap');

  // Fail fast on insecure production config. The guard must reject BOTH the
  // AppConfig default ('dev-secret-change-me') AND the value shipped in
  // .env.example ('dev-secret-change-me-in-production'), so a deploy that copies
  // the example file cannot boot with a secret that is committed in the repo.
  const weakSecret =
    config.jwtSecret.startsWith('dev-secret-change-me') || config.jwtSecret.length < 32;
  if (weakSecret) {
    if (config.isProd) {
      throw new Error(
        'JWT_SECRET must be a strong, unique value (>=32 chars, not the example secret) in production. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
      );
    }
    logger.warn('Using a weak/default JWT_SECRET — set a strong JWT_SECRET before deploying');
  }
  // The default admin password is a full account compromise if shipped to prod.
  if (config.isProd && config.admin.password === 'change-me-admin-password') {
    throw new Error('ADMIN_PASSWORD must be changed from the default before running in production');
  }

  // Application-tier security headers (defense in depth alongside Caddy/Next):
  // protects direct/native clients and any HTML error pages. Pure-JSON API, so a
  // restrictive CSP is safe.
  app.use((_req: unknown, res: ServerResponse, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.removeHeader('X-Powered-By');
    next();
  });

  // Behind a reverse proxy (Caddy) — trust X-Forwarded-* for correct IPs.
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance();
  if (instance && typeof instance.set === 'function') {
    instance.set('trust proxy', 1);
    instance.disable('x-powered-by');
  }

  // CORS: same-origin browser traffic flows through the Next.js proxy and needs
  // no CORS, so the allowlist exists only for the native (Capacitor) origin. Never
  // combine credentialed CORS with wildcard reflection — in production an empty
  // allowlist means "no cross-origin access" rather than "reflect any origin".
  app.enableCors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : config.isProd ? false : true,
    credentials: true,
  });

  // All request bodies are validated with zod (ZodBody) at each controller, so
  // no class-validator global pipe is needed.

  await app.listen(config.port, '0.0.0.0');
  logger.log(`UnlikelyLand API listening on :${config.port}`);
}

void bootstrap();
