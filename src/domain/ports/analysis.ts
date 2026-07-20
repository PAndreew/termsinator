import type { Result } from '../../shared/result';
import type { TermsDocument } from '../entities/terms-document';
import type { VerifiedPolicyModelAnalysis } from '../entities/policy-analysis';
import type { Language } from '../value-objects/language';
import type { ProviderId } from '../value-objects/provider-id';

export interface UrlDiscoveryAnalysis {
  readonly kind: 'url_discovery';
  readonly discoveredUrls: { readonly terms: string | null; readonly privacy: string | null };
}

export type LlmAnalysis = VerifiedPolicyModelAnalysis | UrlDiscoveryAnalysis;

export interface AnalysisRequest {
  readonly documents: readonly TermsDocument[];
  readonly language: Language;
  readonly maxTokens?: number;
  readonly isSynthesis?: boolean;
  readonly isUrlDiscovery?: boolean;
  /** Original documents used to verify quotes returned by a synthesis pass. */
  readonly sourceDocuments?: readonly TermsDocument[];
}

export interface LlmAnalyzer {
  readonly providerLabel: string;
  readonly model: string;
  analyze(request: AnalysisRequest): Promise<Result<LlmAnalysis, Error>>;
}

export interface LlmAnalyzerFactory {
  create(
    provider: ProviderId,
    secret: string,
    model?: string,
  ): LlmAnalyzer;
}
