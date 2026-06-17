const CHARS_PER_TOKEN = 4;

export interface ChunkOptions {
  /** Maximum tokens each chunk may contain. */
  readonly chunkTokens: number;
  /** How many tokens of the previous chunk to repeat at the start of the next one. */
  readonly overlapTokens: number;
}

/**
 * Splits a plain-text document into overlapping windows that each fit within
 * a model's context budget. Tries to break at paragraph → newline → sentence →
 * word boundaries to avoid cutting mid-thought.
 */
export class DocumentChunker {
  chunk(text: string, options: ChunkOptions): string[] {
    const { chunkTokens, overlapTokens } = options;
    const chunkChars = chunkTokens * CHARS_PER_TOKEN;
    const overlapChars = Math.max(0, overlapTokens * CHARS_PER_TOKEN);

    if (text.trim().length === 0) return [];
    if (text.length <= chunkChars) return [text];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const rawEnd = start + chunkChars;

      if (rawEnd >= text.length) {
        const tail = text.slice(start);
        if (tail.trim().length > 0) chunks.push(tail);
        break;
      }

      const slice = text.slice(start, rawEnd);
      const breakAt = findBreakPoint(slice);
      const chunk = text.slice(start, start + breakAt).trimEnd();
      if (chunk.trim().length > 0) chunks.push(chunk);

      const nextStart = start + breakAt - overlapChars;
      // Guard against infinite loops: always advance by at least 1 char.
      start = nextStart > start ? nextStart : start + Math.max(1, Math.floor(chunkChars / 2));
    }

    return chunks;
  }
}

/** Returns the index within `text` at which to cut, preferring natural boundaries. */
function findBreakPoint(text: string): number {
  const half = Math.floor(text.length / 2);

  for (const sep of ['\n\n', '\n', '. ', '! ', '? ', ' ']) {
    const idx = text.lastIndexOf(sep);
    if (idx >= half) return idx + sep.length;
  }

  // Hard cut — no natural break found in the second half.
  return text.length;
}
