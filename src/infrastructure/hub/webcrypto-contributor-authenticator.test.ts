import { describe, expect, it } from 'vitest';
import { WebCryptoContributorAuthenticator } from './webcrypto-contributor-authenticator';
import type { ContributorIdentity } from '../../domain/entities/contributor-identity';
import type { ContributorIdentityRepository } from '../../domain/ports/repositories';

class MemoryIdentityRepository implements ContributorIdentityRepository {
  value: ContributorIdentity | null = null;
  async load() { return this.value; }
  async save(value: ContributorIdentity) { this.value = value; }
}

describe('WebCryptoContributorAuthenticator', () => {
  it('persists one local keypair and signs with an existing registration', async () => {
    const repo = new MemoryIdentityRepository(); const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    repo.value = { publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey), registrations: { 'https://hub.test': 'a'.repeat(64) } };
    const headers = await new WebCryptoContributorAuthenticator(repo).signedHeaders('https://hub.test/', '{}');
    expect(headers?.['x-contributor-id']).toBe('a'.repeat(64)); expect(headers?.['x-signature']).toBeTruthy();
  });
});
