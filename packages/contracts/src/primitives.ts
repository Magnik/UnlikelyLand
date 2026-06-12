import { z } from "zod";

export const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const id = z.string().uuid();
export const timestamp = z.string().datetime({ offset: true });
export const nonNegativeInteger = z.number().int().nonnegative();
