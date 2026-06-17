import type { HubClient, HubLookupResult } from '../../domain/ports/hub';
import type { RiskAssessment } from '../../domain/entities/risk-assessment';
import type { SettingsRepository } from '../../domain/ports/repositories';

const LOOKUP_TIMEOUT_MS = 5_000;
const SUBMIT_TIMEOUT_MS = 10_000;

/**
 * Hub client that reads the user's current settings on every call.
 * Returns null / no-ops immediately when shareAnalyses=false or hubUrl=null,
 * so the use case never needs to check those flags itself.
 *
 * Caches the HttpHubClient instance while the hub URL stays the same, which is
 * the common case. A URL change creates a new client on the next call.
 */
export class SettingsAwareHubClient implements HubClient {
  private cache: { url: string; client: HttpHubClient } | null = null;

  constructor(private readonly settingsRepo: SettingsRepository) {}

  async lookup(origin: string, termsHash: string): Promise<HubLookupResult | null> {
    const cfg = await this.settingsRepo.load();
    if (!cfg.shareAnalyses || !cfg.hubUrl) return null;
    return this.forUrl(cfg.hubUrl).lookup(origin, termsHash);
  }

  async submit(
    origin: string,
    termsHash: string,
    assessment: RiskAssessment,
    installationId: string,
    language: string,
  ): Promise<void> {
    const cfg = await this.settingsRepo.load();
    if (!cfg.shareAnalyses || !cfg.hubUrl) return;
    return this.forUrl(cfg.hubUrl).submit(origin, termsHash, assessment, installationId, language);
  }

  private forUrl(url: string): HttpHubClient {
    if (!this.cache || this.cache.url !== url) {
      this.cache = { url, client: new HttpHubClient(url) };
    }
    return this.cache.client;
  }
}

/** Low-level HTTP client for a single hub URL. Stateless beyond the base URL. */
class HttpHubClient implements HubClient {
  constructor(private readonly baseUrl: string) {}

  async lookup(origin: string, termsHash: string): Promise<HubLookupResult | null> {
    const url =
      `${this.baseUrl}/analyses` +
      `?origin=${encodeURIComponent(origin)}&hash=${encodeURIComponent(termsHash)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      if (!res.ok) return null;
      const body = (await res.json()) as { ok: boolean; data?: HubLookupResult };
      return body.ok && body.data ? body.data : null;
    } catch {
      return null; // network errors are non-fatal
    }
  }

  async submit(
    origin: string,
    termsHash: string,
    assessment: RiskAssessment,
    installationId: string,
    language: string,
  ): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installationId,
          origin,
          termsHash,
          result: assessment,
          provider: assessment.provenance.provider ?? undefined,
          model: assessment.provenance.model ?? undefined,
          language,
        }),
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      });
    } catch {
      // Best-effort: never block the main flow on a hub submission failure.
    }
  }
}
