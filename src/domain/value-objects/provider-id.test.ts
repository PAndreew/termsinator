import { describe, it, expect } from 'vitest';
import {
  PROVIDER_IDS,
  PROVIDER_REGION,
  isProviderId,
  providerDisplayName,
} from './provider-id';

describe('ProviderId', () => {
  it('recognises every known provider id', () => {
    for (const id of PROVIDER_IDS) {
      expect(isProviderId(id)).toBe(true);
    }
  });

  it('rejects unknown ids', () => {
    expect(isProviderId('cohere')).toBe(false);
    expect(isProviderId('')).toBe(false);
    expect(isProviderId('OpenAI')).toBe(false); // case sensitive
  });

  it('has a human display name for every provider', () => {
    for (const id of PROVIDER_IDS) {
      expect(providerDisplayName(id)).toMatch(/\S/);
    }
  });

  it('classifies provider regions across us/eu/cn', () => {
    expect(PROVIDER_REGION.openai).toBe('us');
    expect(PROVIDER_REGION.mistral).toBe('eu');
    expect(PROVIDER_REGION.deepseek).toBe('cn');
    // every provider is regionised
    for (const id of PROVIDER_IDS) {
      expect(['us', 'eu', 'cn']).toContain(PROVIDER_REGION[id]);
    }
  });
});
