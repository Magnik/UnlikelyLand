import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Minimal in-memory sliding-window rate limiter. No external dependency or Redis —
 * a single-process map is enough to blunt brute-force logins and AI-generation
 * spam on a small VPS deployment. Identified per authenticated character when
 * available, else by the (proxy-trusted) client IP.
 *
 * Decorate a route with @RateLimit({ limit, windowMs }) and add RateLimitGuard via
 * @UseGuards. Routes without the decorator are unaffected.
 */
export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  /** Optional stable bucket key; defaults to the handler name. */
  key?: string;
  /**
   * If set, ALSO enforce a bucket keyed by this request-body field (normalized),
   * independent of the IP bucket. Used so login/register are throttled PER ACCOUNT
   * regardless of source IP — the per-IP bucket is unreliable behind the Next.js
   * proxy, which collapses every client to one upstream address.
   */
  bodyKey?: string;
}

export const RATE_LIMIT_KEY = 'rate_limit_config';
export const RateLimit = (cfg: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, cfg);

const buckets = new Map<string, number[]>();

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const cfg = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!cfg) return true;

    const req = ctx.switchToHttp().getRequest();
    const base = cfg.key ?? ctx.getHandler().name;
    const now = Date.now();

    // Bucket 1: per-identity (authenticated character/user, else client IP).
    const identity = req?.user?.characterId ?? req?.user?.userId ?? req?.ip ?? 'anon';
    const keys = [`${base}:${identity}`];

    // Bucket 2 (optional): per request-body field, so e.g. login is throttled per
    // username even when many clients share one upstream IP behind the proxy.
    if (cfg.bodyKey) {
      const raw = req?.body?.[cfg.bodyKey];
      if (typeof raw === 'string' && raw.trim()) {
        keys.push(`${base}:body:${cfg.bodyKey}:${raw.trim().toLowerCase()}`);
      }
    }

    // Reject if ANY bucket is over its limit; only record the hit once all pass.
    const snapshots: { key: string; recent: number[] }[] = [];
    for (const bucketKey of keys) {
      const recent = (buckets.get(bucketKey) ?? []).filter((t) => now - t < cfg.windowMs);
      if (recent.length >= cfg.limit) {
        throw new HttpException('Too many requests — slow down a moment', HttpStatus.TOO_MANY_REQUESTS);
      }
      snapshots.push({ key: bucketKey, recent });
    }
    for (const { key, recent } of snapshots) {
      recent.push(now);
      buckets.set(key, recent);
    }

    // Opportunistic cleanup so the map can't grow without bound.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (v.every((t) => now - t >= cfg.windowMs)) buckets.delete(k);
      }
    }
    return true;
  }
}
