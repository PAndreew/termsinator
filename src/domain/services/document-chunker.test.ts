import { describe, it, expect } from 'vitest';
import { DocumentChunker } from './document-chunker';

describe('DocumentChunker', () => {
  const chunker = new DocumentChunker();

  it('returns the text as a single chunk when it fits', () => {
    const text = 'Hello world.';
    expect(chunker.chunk(text, { chunkTokens: 100, overlapTokens: 5 })).toEqual([text]);
  });

  it('returns empty array for blank input', () => {
    expect(chunker.chunk('', { chunkTokens: 10, overlapTokens: 2 })).toEqual([]);
    expect(chunker.chunk('   \n\n  ', { chunkTokens: 10, overlapTokens: 2 })).toEqual([]);
  });

  it('produces multiple chunks when text exceeds the token limit', () => {
    // 200 tokens × 4 chars/token = 800 chars; chunk at 50 tokens (200 chars)
    const text = 'word '.repeat(160); // 800 chars ≈ 200 tokens
    const chunks = chunker.chunk(text, { chunkTokens: 50, overlapTokens: 5 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });

  it('each chunk stays within the character limit', () => {
    const text = 'word '.repeat(160);
    const chunkTokens = 50;
    const chunks = chunker.chunk(text, { chunkTokens, overlapTokens: 5 });
    const maxChars = chunkTokens * 4;
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it('covers all sections of the source text across chunks', () => {
    // Three clearly distinct sections separated by content
    const text =
      'Alpha-content '.repeat(20) + '\n\n' +
      'Beta-content '.repeat(20) + '\n\n' +
      'Gamma-content '.repeat(20);
    const chunks = chunker.chunk(text, { chunkTokens: 40, overlapTokens: 4 });
    const joined = chunks.join(' ');
    expect(joined).toContain('Alpha');
    expect(joined).toContain('Beta');
    expect(joined).toContain('Gamma');
  });

  it('prefers paragraph breaks over hard cuts', () => {
    const para1 = 'a '.repeat(20).trimEnd(); // 40 chars
    const para2 = 'b '.repeat(20).trimEnd(); // 40 chars
    const text = `${para1}\n\n${para2}`;
    // chunk at 15 tokens (60 chars) — para1 fits but not both paragraphs together
    const chunks = chunker.chunk(text, { chunkTokens: 15, overlapTokens: 2 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // first chunk should contain 'a' content
    expect(chunks[0]).toMatch(/a/);
    // last chunk should reach 'b' content
    expect(chunks[chunks.length - 1]).toMatch(/b/);
  });

  it('overlap makes subsequent chunks start before the end of the previous one', () => {
    // 400 chars ≈ 100 tokens; chunk at 30 tokens (120 chars), overlap 6 tokens (24 chars)
    const text = 'word '.repeat(80); // 400 chars
    const chunks = chunker.chunk(text, { chunkTokens: 30, overlapTokens: 6 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The first chunk's last word should appear in the start of the second chunk
    const firstWords = chunks[0]!.trim().split(/\s+/);
    const lastWordOfFirst = firstWords[firstWords.length - 1]!;
    expect(chunks[1]).toContain(lastWordOfFirst);
  });

  it('handles text with only one natural break gracefully', () => {
    const text = 'no breaks here '.repeat(30); // sentence-like repetition
    const chunks = chunker.chunk(text, { chunkTokens: 20, overlapTokens: 3 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });
});
