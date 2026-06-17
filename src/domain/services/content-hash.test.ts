import { describe, it, expect } from 'vitest';
import { contentHash } from './content-hash';

describe('contentHash', () => {
  it('returns a 64-char hex string (SHA-256)', async () => {
    const hash = await contentHash(['hello']);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same output for the same input', async () => {
    const a = await contentHash(['Terms text', 'Privacy text']);
    const b = await contentHash(['Terms text', 'Privacy text']);
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', async () => {
    const a = await contentHash(['Version 1']);
    const b = await contentHash(['Version 2']);
    expect(a).not.toBe(b);
  });

  it('treats different orderings as different documents', async () => {
    const a = await contentHash(['A', 'B']);
    const b = await contentHash(['B', 'A']);
    expect(a).not.toBe(b);
  });

  it('handles empty array', async () => {
    const hash = await contentHash([]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
