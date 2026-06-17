import type { RiskAssessment } from '../entities/risk-assessment';

/** Returned by the hub when a cached analysis is found. */
export interface HubLookupResult {
  /** The full assessment exactly as the originating installation stored it. */
  readonly assessment: RiskAssessment;
  /** True when the stored terms hash matches the current terms content. */
  readonly isFresh: boolean;
  readonly provider: string | null;
  readonly model: string | null;
  readonly analyzedAt: number;
}

/**
 * Port for the optional community analysis cache (termsinator-hub).
 *
 * Opted-in installations look up cached analyses before running their own LLM
 * call, and submit their results afterwards so others can benefit. The hub URL
 * and consent flag live in Settings; this port is always injected but acts as
 * a no-op when the user has not opted in (see SettingsAwareHubClient).
 */
export interface HubClient {
  /**
   * Returns a cached analysis for the given origin, or null if none is
   * available or the hub is unreachable. Never throws.
   */
  lookup(origin: string, termsHash: string): Promise<HubLookupResult | null>;

  /**
   * Submits an analysis to the hub. Fire-and-forget: the caller must not await
   * the result or depend on its success. Never throws.
   */
  submit(
    origin: string,
    termsHash: string,
    assessment: RiskAssessment,
    installationId: string,
    language: string,
  ): Promise<void>;
}
