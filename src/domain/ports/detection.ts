import type { ProviderId } from '../value-objects/provider-id';
import type { CredentialKind } from '../entities/provider-key';

/** A credential discovered on a provider dashboard (pre-persistence). */
export interface DetectedCredential {
  readonly provider: ProviderId;
  readonly kind: CredentialKind;
  readonly secret: string;
  readonly sourceHost: string;
}

export interface KeyDetectionInput {
  readonly host: string;
  /** Candidate strings harvested from the page (text nodes, input values, storage). */
  readonly samples: readonly string[];
}

/**
 * Detects BYOK credentials. Implementations only act on known provider hosts to
 * avoid harvesting keys that are not the user's own.
 */
export interface KeyDetector {
  detect(input: KeyDetectionInput): readonly DetectedCredential[];
  /** True when `host` is a recognised provider dashboard worth scanning. */
  isProviderHost(host: string): boolean;
}

/** Language inference from environment + page hints; pure and synchronous. */
export interface LanguageDetector {
  detect(hints: {
    navigatorLanguages?: readonly string[];
    documentLang?: string | null;
    sampleText?: string;
  }): import('../value-objects/language').Language;
}
