import { describe, it, expect } from 'vitest';
import { moderateText, moderateDisplayName } from './moderation';

describe('moderateText leetspeak normalization', () => {
  it('catches simple leetspeak evasions of hard-blocked terms', () => {
    expect(moderateText('n4zi', 'pg13').safe).toBe(false); // 4 -> a
    expect(moderateText('p0rn', 'pg13').safe).toBe(false); // 0 -> o
    expect(moderateText('b3stiality', 'r').safe).toBe(false); // 3 -> e
  });

  it('does NOT false-positive on legitimate words that merely contain a blocked substring', () => {
    // word-boundary matching keeps these safe
    expect(moderateText('I bought some grapes at the therapist', 'pg13').safe).toBe(true);
    expect(moderateText('a grape and a drape', 'r').safe).toBe(true);
  });

  it('still allows ordinary friendly text', () => {
    expect(moderateText('hello island friends, lovely soup today', 'pg13').safe).toBe(true);
  });
});

describe('moderateDisplayName', () => {
  it('rejects blank / whitespace-only names', () => {
    expect(moderateDisplayName('   ').safe).toBe(false);
  });

  it('rejects names containing links or markup', () => {
    expect(moderateDisplayName('visit http://evil.example').safe).toBe(false);
    expect(moderateDisplayName('<b>hi</b>').safe).toBe(false);
  });

  it('rejects blocklisted terms even when leetspeak-disguised', () => {
    expect(moderateDisplayName('n4zi').safe).toBe(false);
  });

  it('accepts a normal display name', () => {
    expect(moderateDisplayName('Captain Soup').safe).toBe(true);
  });
});
