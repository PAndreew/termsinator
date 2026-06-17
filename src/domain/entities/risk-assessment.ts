import type { LegalFramework } from '../value-objects/legal-framework';
import type { RiskScoreSnapshot } from '../value-objects/risk-score';
import type { RedFlag } from '../value-objects/red-flag';
import type { ProviderId } from '../value-objects/provider-id';

export interface FrameworkScore {
  readonly framework: LegalFramework;
  readonly score: RiskScoreSnapshot;
  readonly rationale: string;
}

/**
 * Records which engine produced the scores.
 * 'hub' means the result was fetched from the community cache rather than
 * produced locally; provider/model reflect the original analysis.
 */
export interface AnalysisProvenance {
  readonly mode: 'llm' | 'heuristic' | 'hub';
  readonly provider: ProviderId | null;
  readonly model: string | null;
}

/**
 * The full verdict for one site: an overall risk score, a per-framework
 * breakdown, the concrete red flags found, and exactly the layman summary the
 * user asked for (kept to ~5 lines) rendered in their language.
 */
export interface RiskAssessment {
  readonly overall: RiskScoreSnapshot;
  readonly frameworks: readonly FrameworkScore[];
  readonly redFlags: readonly RedFlag[];
  readonly summaryLines: readonly string[];
  readonly language: string;
  readonly provenance: AnalysisProvenance;
  readonly createdAt: number;
}
