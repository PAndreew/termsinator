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
  /**
   * Model identifier override. When set, overrides the provider's default model.
   * For OpenRouter use the routed form, e.g. "deepseek/deepseek-chat-v3-0324".
   */
  readonly modelOverride: string | null;
  /** Re-analyse even if a cached assessment exists. */
  readonly alwaysRefresh: boolean;
  /**
   * Opt-in: share anonymised analysis results with the community hub so other
   * installations can benefit from cached verdicts without running their own LLM.
   * Off by default — the user must explicitly enable this.
   */
  readonly shareAnalyses: boolean;
  /** Base URL of the termsinator-hub instance to use. Null disables hub sharing. */
  readonly hubUrl: string | null;
  /**
   * Stable UUID generated once on first install. Never changes after that.
   * Sent to the hub with submissions so the server can rate-limit per installation.
   * The hub only exposes the first 8 chars publicly (no PII linkage).
   */
  readonly installationId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  languageOverride: null,
  autoToast: true,
  activeProvider: null,
  maxTokens: 6000,
  modelOverride: null,
  alwaysRefresh: false,
  shareAnalyses: false,
  hubUrl: null,
  installationId: '',
};
