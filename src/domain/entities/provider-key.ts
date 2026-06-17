import type { ProviderId } from '../value-objects/provider-id';

export type CredentialKind = 'api_key' | 'auth_json';

/**
 * A BYOK credential the user owns. The secret stays on-device (KeyVault); the
 * `masked` form is what the UI renders. `sourceHost` records the provider
 * dashboard it was detected on, which also disambiguates shared key prefixes.
 */
export interface ProviderKey {
  readonly id: string;
  readonly provider: ProviderId;
  readonly kind: CredentialKind;
  readonly secret: string;
  readonly masked: string;
  readonly sourceHost: string;
  readonly createdAt: number;
}

/** Mask all but the leading prefix and last 4 chars, never revealing the body. */
export function maskSecret(secret: string): string {
  const s = secret.trim();
  if (s.length <= 10) return '••••';
  const prefixMatch = /^(sk-ant-|sk-or-v1-|sk-proj-|sk-or-|sk-|xai-|gsk_|pplx-|fw_|AIza)/.exec(s);
  const prefix = prefixMatch ? prefixMatch[1] : s.slice(0, 3);
  return `${prefix}…${s.slice(-4)}`;
}
