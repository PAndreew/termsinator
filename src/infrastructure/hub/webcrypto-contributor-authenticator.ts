import type { ContributorAuthenticator } from '../../domain/ports/hub';
import type { ContributorIdentity } from '../../domain/entities/contributor-identity';
import type { ContributorIdentityRepository } from '../../domain/ports/repositories';

export class WebCryptoContributorAuthenticator implements ContributorAuthenticator {
  constructor(private readonly repository: ContributorIdentityRepository) {}

  async signedHeaders(hubUrl: string, body: string): Promise<Record<string, string> | null> {
    try {
      const identity = await this.identity(); const base = normalize(hubUrl);
      const contributorId = identity.registrations[base] ?? await this.register(base, identity);
      const timestamp = Date.now(); const nonce = crypto.randomUUID();
      const signature = await sign(identity.privateKey, `termsinator-submit\n${timestamp}\n${nonce}\n${body}`);
      return { 'x-contributor-id': contributorId, 'x-timestamp': String(timestamp), 'x-nonce': nonce, 'x-signature': signature };
    } catch { return null; }
  }

  async forgetRegistration(hubUrl: string): Promise<void> {
    const identity = await this.repository.load(); if (!identity) return; const registrations = { ...identity.registrations };
    delete registrations[normalize(hubUrl)]; await this.repository.save({ ...identity, registrations });
  }

  private async identity(): Promise<ContributorIdentity> {
    const existing = await this.repository.load(); if (existing) return existing;
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const identity = { publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey), registrations: {} };
    await this.repository.save(identity); return identity;
  }

  private async register(base: string, identity: ContributorIdentity): Promise<string> {
    const challengeRes = await fetch(`${base}/v2/contributors/challenges`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publicKey: identity.publicKey }) });
    if (!challengeRes.ok) throw new Error('contributor challenge failed');
    const challenge = await challengeRes.json() as { challengeId: string; challenge: string; proofOfWorkBits: number };
    const proof = await solveProof(challenge.challenge, challenge.proofOfWorkBits);
    const signature = await sign(identity.privateKey, `termsinator-register\n${challenge.challengeId}\n${challenge.challenge}\n${proof}`);
    const registerRes = await fetch(`${base}/v2/contributors/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.challengeId, publicKey: identity.publicKey, proof, signature }) });
    if (!registerRes.ok) throw new Error('contributor registration failed');
    const registered = await registerRes.json() as { contributorId: string };
    await this.repository.save({ ...identity, registrations: { ...identity.registrations, [base]: registered.contributorId } });
    return registered.contributorId;
  }
}

async function solveProof(challenge: string, bits: number): Promise<number> {
  for (let proof = 0; proof < 10_000_000; proof++) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${challenge}:${proof}`)));
    if (leadingZeroBits(digest) >= bits) return proof;
  }
  throw new Error('proof of work limit exceeded');
}
function leadingZeroBits(bytes: Uint8Array): number { let count = 0; for (const byte of bytes) { if (byte === 0) { count += 8; continue; } return count + Math.clz32(byte) - 24; } return count; }
async function sign(jwk: JsonWebKey, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(message)));
  let binary = ''; for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function normalize(url: string): string { return url.replace(/\/+$/, ''); }
