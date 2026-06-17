/**
 * SHA-256 fingerprint of the joined sanitised document texts.
 * Used as the change-detection key for the community hub: if the hash of the
 * fetched terms content matches what the hub stored, the cached analysis is fresh.
 */
export async function contentHash(texts: readonly string[]): Promise<string> {
  const combined = texts.join('\x00');
  const bytes = new TextEncoder().encode(combined);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
