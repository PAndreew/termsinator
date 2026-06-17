import { describe, it, expect } from 'vitest';
import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
  it('is deterministic and stable for the same input', () => {
    expect(fingerprint('sk-ant-abc')).toBe(fingerprint('sk-ant-abc'));
  });

  it('differs for different inputs', () => {
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
  });

  it('always returns 8 hex chars', () => {
    for (const s of ['', 'x', 'a much longer secret value 1234567890']) {
      expect(fingerprint(s)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});
