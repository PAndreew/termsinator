import { type Result, ok, err } from '../shared/result';
import { type ProviderKey, maskSecret } from '../domain/entities/provider-key';
import { fingerprint } from '../domain/services/fingerprint';
import type { KeyDetector, KeyDetectionInput } from '../domain/ports/detection';
import type { KeyVault } from '../domain/ports/repositories';
import type { Clock, Logger } from '../domain/ports/platform';

export interface DetectProviderKeysDeps {
  readonly detector: KeyDetector;
  readonly keyVault: KeyVault;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Scans page samples for BYOK credentials — but only on recognised provider
 * dashboards, so we never harvest a key that might not be the user's. Newly
 * found credentials are persisted (de-duplicated by a fingerprint of the secret)
 * and the freshly-added ones are returned for a one-time confirmation toast.
 */
export class DetectProviderKeys {
  constructor(private readonly deps: DetectProviderKeysDeps) {}

  async execute(input: KeyDetectionInput): Promise<Result<readonly ProviderKey[], Error>> {
    const { detector, keyVault, clock, logger } = this.deps;
    if (!detector.isProviderHost(input.host)) {
      return ok([]);
    }

    const existing = new Set((await keyVault.list()).map((k) => k.id));
    const added: ProviderKey[] = [];

    for (const found of detector.detect(input)) {
      const id = `${found.provider}:${fingerprint(found.secret)}`;
      if (existing.has(id)) continue;
      const key: ProviderKey = {
        id,
        provider: found.provider,
        kind: found.kind,
        secret: found.secret,
        masked: maskSecret(found.secret),
        sourceHost: found.sourceHost,
        createdAt: clock.now(),
      };
      try {
        await keyVault.add(key);
        existing.add(id);
        added.push(key);
      } catch (e) {
        logger.log('error', 'failed to store detected key', { provider: found.provider });
        return err(e instanceof Error ? e : new Error(String(e)));
      }
    }

    return ok(added);
  }
}
