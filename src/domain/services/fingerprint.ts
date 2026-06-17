/**
 * FNV-1a 32-bit hash rendered as hex. Non-cryptographic — used only to derive a
 * stable, collision-resistant-enough id for a credential so the same secret maps
 * to the same ProviderKey id (natural de-duplication) without storing the secret
 * in the id itself.
 */
export function fingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
