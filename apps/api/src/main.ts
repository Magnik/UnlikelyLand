import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './common/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const config = app.get(AppConfig);

  // Behind a reverse proxy (Caddy) — trust X-Forwarded-* for correct IPs.
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance();
  if (instance && typeof instance.set === 'function') {
    instance.set('trust proxy', 1);
  }

  // CORS: same-origin browser traffic flows through the Next.js proxy and needs
  // no CORS; this allowlist is for the native (Capacitor) origin later.
  app.enableCors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    credentials: true,
  });

  // All request bodies are validated with zod (ZodBody) at each controller, so
  // no class-validator global pipe is needed.

  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`UnlikelyLand API listening on :${config.port}`);
}

void bootstrap();
