import { describe, expect, it } from 'vitest';
import { policyUrlsChanged } from './policy-staleness';

describe('policyUrlsChanged', () => {
  it('does not mark a site stale when discovery finds additional policy links', () => {
    expect(policyUrlsChanged(
      ['https://example.com/privacy', 'https://example.com/terms'],
      ['https://example.com/privacy', 'https://example.com/terms', 'https://example.com/cookies'],
    )).toBe(false);
  });

  it('marks a site stale when a previously analyzed policy URL disappears', () => {
    expect(policyUrlsChanged(
      ['https://example.com/privacy', 'https://example.com/terms'],
      ['https://example.com/privacy'],
    )).toBe(true);
  });
});
