import type { Result } from '../../shared/result';
import type { TermsDocument } from '../entities/terms-document';
import type { Language } from '../value-objects/language';
import type { LegalFramework } from '../value-objects/legal-framework';

/** Structured result an LLM adapter must return, regardless of vendor. */
export interface LlmFrameworkVerdict {
  readonly framework: LegalFramework;
  readonly score: number; // 0..100 risk
  readonly rationale: string;
}

export interface LlmAnalysisFlag {
  readonly id: string;
  readonly messageKey: string;
  readonly affects: readonly LegalFramework[];
  readonly weight: number;
  readonly evidence: string;
}

export interface LlmAnalysis {
  readonly frameworks: readonly LlmFrameworkVerdict[];
  readonly redFlags: readonly LlmAnalysisFlag[];
  readonly summaryLines: readonly string[];
}

export interface AnalysisRequest {
  readonly documents: readonly TermsDocument[];
  readonly language: Language;
  readonly frameworks: readonly LegalFramework[];
  /**
   * The caller's configured token budget. The ChunkingLlmAnalyzer uses this to
   * decide whether to split (totalTokens > maxTokens × 0.7).
   */
  readonly maxTokens?: number;
  /**
   * True when this request carries pre-formatted partial analyses from a chunked
   * run. The prompt builders switch to a synthesis-oriented system prompt.
   */
  readonly isSynthesis?: boolean;
}

/**
 * Port for any LLM backend. Every concrete adapter (OpenAI, Anthropic, Google,
 * OpenAI-compatible) is Liskov-substitutable behind this single interface; the
 * LlmAnalyzerFactory picks one based on the active credential.
 */
export interface LlmAnalyzer {
  readonly providerLabel: string;
  readonly model: string;
  analyze(request: AnalysisRequest): Promise<Result<LlmAnalysis, Error>>;
}

/**
 * Creates the right Liskov-substitutable analyzer for a given credential. The
 * concrete factory lives in infrastructure; the use case depends only on this.
 */
export interface LlmAnalyzerFactory {
  create(
    provider: import('../value-objects/provider-id').ProviderId,
    secret: string,
    model?: string,
  ): LlmAnalyzer;
}
