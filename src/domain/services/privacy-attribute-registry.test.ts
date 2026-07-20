import { describe, expect, it } from 'vitest';
import { PRIVACY_ATTRIBUTES } from './privacy-attribute-registry';

describe('privacy attribute registry v1', () => {
  it('contains 43 unique attributes whose weights total 100', () => {
    expect(PRIVACY_ATTRIBUTES).toHaveLength(43);
    expect(new Set(PRIVACY_ATTRIBUTES.map((item) => item.id)).size).toBe(43);
    expect(PRIVACY_ATTRIBUTES.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
  });

  it('contains classification guidance without exposing derived scores', () => {
    for (const item of PRIVACY_ATTRIBUTES) {
      expect(item.definition.length).toBeGreaterThan(10);
      expect(item.state0Anchor.length).toBeGreaterThan(5);
      expect(item.state4Anchor.length).toBeGreaterThan(5);
    }
  });
});
