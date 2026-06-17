import type { ProviderId } from '../value-objects/provider-id';

/** User-tunable behaviour, persisted in browser.storage.local. */
export interface Settings {
  /** Explicit UI/analysis language override; null means auto-detect. */
  readonly languageOverride: string | null;
  /** Show the non-intrusive toast when an un-assessed site is opened. */
  readonly autoToast: boolean;
  /** Which detected credential to prefer for analysis; null = first available. */
  readonly activeProvider: ProviderId | null;
  /** Token budget for the sanitised document sent to the LLM. */
  readonly maxTokens: number;
  /** Re-analyse even if a cached assessment exists. */
  readonly alwaysRefresh: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  languageOverride: null,
  autoToast: true,
  activeProvider: null,
  maxTokens: 6000,
  alwaysRefresh: false,
};
