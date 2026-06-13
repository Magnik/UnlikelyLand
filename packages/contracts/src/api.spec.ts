import { describe, expect, it } from 'vitest';
import { CreateListingSchema, RegisterSchema, ResolveChoiceSchema, SendMailSchema } from './api';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('API DTO schemas', () => {
  it('RegisterSchema enforces username/password rules', () => {
    expect(RegisterSchema.safeParse({ username: 'ab', password: 'longenough' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ username: 'valid_1', password: 'short' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ username: 'bad name', password: 'longenough' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ username: 'valid_1', password: 'longenough' }).success).toBe(true);
  });

  it('CreateListingSchema requires a positive price and defaults quantity to 1', () => {
    const ok = CreateListingSchema.safeParse({ inventoryItemId: UUID, priceAmount: 5 });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.quantity).toBe(1);
    expect(CreateListingSchema.safeParse({ inventoryItemId: UUID, priceAmount: 0 }).success).toBe(false);
    expect(CreateListingSchema.safeParse({ inventoryItemId: 'not-a-uuid', priceAmount: 5 }).success).toBe(false);
  });

  it('SendMailSchema requires a body within length limits', () => {
    expect(SendMailSchema.safeParse({ recipientName: 'Bob', body: '' }).success).toBe(false);
    expect(SendMailSchema.safeParse({ recipientName: 'Bob', body: 'hi there' }).success).toBe(true);
    expect(SendMailSchema.safeParse({ recipientName: 'Bob', body: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('ResolveChoiceSchema validates the encounter id and choice id shape', () => {
    expect(ResolveChoiceSchema.safeParse({ encounterId: UUID, choiceId: 'wrestle' }).success).toBe(true);
    expect(ResolveChoiceSchema.safeParse({ encounterId: 'bad', choiceId: 'wrestle' }).success).toBe(false);
    expect(ResolveChoiceSchema.safeParse({ encounterId: UUID, choiceId: 'Bad Choice!' }).success).toBe(false);
  });
});
