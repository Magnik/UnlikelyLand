import { Injectable } from '@nestjs/common';

/**
 * Typed environment configuration. Read once at construction (after
 * ConfigModule has loaded any .env file). Secrets only ever come from the
 * environment — never hardcoded or committed.
 */
@Injectable()
export class AppConfig {
  readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  readonly isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  readonly port = Number(process.env.API_PORT ?? 4000);

  readonly jwtSecret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
  readonly jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '30d';

  readonly corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  readonly ai = {
    enabled: (process.env.AI_ENABLED ?? 'true') !== 'false',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL ?? 'llama3.1:8b',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 25000),
  };

  readonly admin = {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'change-me-admin-password',
  };
}
