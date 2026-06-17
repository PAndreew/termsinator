import type { ProviderId } from '../../domain/value-objects/provider-id';
import type {
  KeyDetector,
  KeyDetectionInput,
  DetectedCredential,
} from '../../domain/ports/detection';
import { patternsForHost, isAuthJsonHost } from './key-pattern-registry';

/**
 * KeyDetector that only acts on recognised provider dashboards. For each page
 * sample it runs the regexes registered for that host and also recognises a
 * Google service-account auth JSON. De-duplicates by secret so the same key
 * appearing in several places is reported once.
 */
export class DashboardKeyDetector implements KeyDetector {
  isProviderHost(host: string): boolean {
    return patternsForHost(host).length > 0 || isAuthJsonHost(host);
  }

  detect(input: KeyDetectionInput): readonly DetectedCredential[] {
    const host = input.host.toLowerCase();
    const patterns = patternsForHost(host);
    const out: DetectedCredential[] = [];
    const seen = new Set<string>();

    const push = (provider: ProviderId, kind: DetectedCredential['kind'], secret: string): void => {
      const trimmed = secret.trim();
      if (trimmed.length === 0 || seen.has(trimmed)) return;
      seen.add(trimmed);
      out.push({ provider, kind, secret: trimmed, sourceHost: host });
    };

    for (const sample of input.samples) {
      for (const p of patterns) {
        // Fresh regex per use to avoid lastIndex statefulness on global flags.
        const m = new RegExp(p.key.source, p.key.flags.replace('g', '')).exec(sample);
        if (m) push(p.provider, 'api_key', m[0]);
      }
      const authJson = isAuthJsonHost(host) ? detectServiceAccountJson(sample) : null;
      if (authJson) push('google', 'auth_json', authJson);
    }

    return out;
  }
}

/** Returns the JSON string if `sample` is a Google service-account credential. */
function detectServiceAccountJson(sample: string): string | null {
  if (!sample.includes('service_account') || !sample.includes('private_key')) return null;
  try {
    const parsed = JSON.parse(sample) as Record<string, unknown>;
    if (parsed.type === 'service_account' && typeof parsed.private_key === 'string') {
      return sample;
    }
  } catch {
    // not valid JSON — ignore
  }
  return null;
}
