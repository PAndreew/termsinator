import type {
  AssessmentConfidence,
  PolicyAction,
  PolicyClassification,
  PolicyEvidence,
  PolicySummaryFact,
} from './policy-analysis';
import type { Grade } from '../value-objects/grade';
import type { ProviderId } from '../value-objects/provider-id';

/** Cross-model confidence snapshot stored on hub-sourced assessments. */
export interface HubStats {
  readonly modelCount: number;
  readonly contributorCount: number;
  readonly disagreement: number;
  readonly confidence: 'moderate' | 'high';
}

export interface AnalysisProvenance {
  readonly mode: 'llm' | 'heuristic' | 'hub';
  readonly provider: ProviderId | null;
  readonly model: string | null;
  readonly hubStats?: HubStats;
}

/** Persisted schema-v3 result. All score fields are application-derived. */
export interface RiskAssessment {
  readonly schemaVersion: '3';
  readonly rubricVersion: 'privacy-rubric-1';
  readonly promptVersion: '3';
  readonly grade: Grade | null;
  readonly score: number | null;
  readonly practiceRisk: number | null;
  readonly coverage: number;
  readonly confidence: AssessmentConfidence;
  readonly evidence: readonly PolicyEvidence[];
  readonly classifications: readonly PolicyClassification[];
  readonly summaryFacts: readonly PolicySummaryFact[];
  readonly actions: readonly PolicyAction[];
  readonly triggeredRules: readonly string[];
  readonly language: string;
  readonly provenance: AnalysisProvenance;
  readonly createdAt: number;
}
