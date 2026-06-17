import { describe, it, expect } from 'vitest';
import { DetectProviderKeys } from './detect-provider-keys';
import { InMemoryKeyVault, FixedClock, NullLogger } from '../test-support/fakes';
import type { KeyDetector, KeyDetectionInput, DetectedCredential } from '../domain/ports/detection';

class StubDetector implements KeyDetector {
  constructor(
    private readonly hosts: string[],
    private readonly found: DetectedCredential[],
  ) {}
  isProviderHost(host: string): boolean {
    return this.hosts.includes(host);
  }
  detect(_input: KeyDetectionInput): readonly DetectedCredential[] {
    return this.found;
  }
}

const cred = (secret: string): DetectedCredential => ({
  provider: 'openai',
  kind: 'api_key',
  secret,
  sourceHost: 'platform.openai.com',
});

describe('DetectProviderKeys', () => {
  it('ignores non-provider hosts entirely', async () => {
    const vault = new InMemoryKeyVault();
    const uc = new DetectProviderKeys({
      detector: new StubDetector(['platform.openai.com'], [cred('sk-abc')]),
      keyVault: vault,
      clock: new FixedClock(),
      logger: new NullLogger(),
    });
    const r = await uc.execute({ host: 'evil.example', samples: ['sk-abc'] });
    expect(r.ok && r.value).toEqual([]);
    expect(await vault.list()).toHaveLength(0);
  });

  it('stores newly detected keys with a masked form', async () => {
    const vault = new InMemoryKeyVault();
    const uc = new DetectProviderKeys({
      detector: new StubDetector(['platform.openai.com'], [cred('sk-proj-ABCDEFGHIJKL1234')]),
      keyVault: vault,
      clock: new FixedClock(7),
      logger: new NullLogger(),
    });
    const r = await uc.execute({ host: 'platform.openai.com', samples: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(1);
    expect(r.value[0]!.masked).toContain('…');
    expect(r.value[0]!.createdAt).toBe(7);
    expect((await vault.list())).toHaveLength(1);
  });

  it('is idempotent: the same secret is not stored twice', async () => {
    const vault = new InMemoryKeyVault();
    const detector = new StubDetector(['platform.openai.com'], [cred('sk-same-1234')]);
    const uc = new DetectProviderKeys({ detector, keyVault: vault, clock: new FixedClock(), logger: new NullLogger() });
    await uc.execute({ host: 'platform.openai.com', samples: [] });
    const second = await uc.execute({ host: 'platform.openai.com', samples: [] });
    expect(second.ok && second.value).toHaveLength(0); // nothing new
    expect(await vault.list()).toHaveLength(1);
  });
});
