import type { PrivacyAttributeId } from '../services/privacy-attribute-registry';
import type { Grade } from '../value-objects/grade';

export type PolicyAttributeState = 0 | 1 | 2 | 3 | 4 | 'unknown' | 'not_applicable';
export type EvidenceConfidence = 'direct' | 'inferred' | 'uncertain';
export type AssessmentConfidence = 'high' | 'moderate' | 'low';

export interface PolicyEvidence {
  readonly evidenceId: string;
  readonly documentId: string;
  readonly documentUrl: string;
  readonly quote: string;
  readonly context?: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ModelPolicyEvidence {
  readonly evidenceId: string;
  readonly documentId: string;
  readonly documentUrl: string;
  readonly quote: string;
  readonly context?: string;
}

export interface PolicyClassification {
  readonly attributeId: PrivacyAttributeId;
  readonly state: PolicyAttributeState;
  readonly confidence: EvidenceConfidence;
  readonly rationale: string;
  readonly evidenceRefs: readonly string[];
  readonly conflict: boolean;
}

export interface PolicySummaryFact {
  readonly text: string;
  readonly attributeIds: readonly PrivacyAttributeId[];
  readonly evidenceRefs: readonly string[];
}

export type PolicyActionUrgency = 'immediate' | 'soon' | 'when_convenient' | 'informational';
export type PolicyActionKind =
  | 'disable_setting'
  | 'revoke_permission'
  | 'opt_out'
  | 'withdraw_consent'
  | 'delete_data'
  | 'delete_account'
  | 'request_access'
  | 'request_correction'
  | 'contact_privacy_team'
  | 'limit_input'
  | 'avoid_sensitive_input'
  | 'use_alternative'
  | 'stop_using_service'
  | 'monitor_policy'
  | 'investigate_unknown';

export interface PolicyAction {
  readonly actionId: string;
  readonly linkedAttributeIds: readonly PrivacyAttributeId[];
  readonly evidenceRefs: readonly string[];
  readonly urgency: PolicyActionUrgency;
  readonly kind: PolicyActionKind;
  readonly impact: 'high' | 'medium' | 'low';
  readonly effort: 'low' | 'medium' | 'high';
  readonly title: string;
  readonly why: string;
  readonly steps: readonly string[];
  readonly target?: {
    readonly label: string;
    readonly url?: string;
    readonly settingsPath?: string;
  };
  readonly fallback?: string;
  readonly destructive: boolean;
}

export interface PolicyModelAnalysis {
  readonly kind: 'policy_analysis';
  readonly schemaVersion: '3';
  readonly rubricVersion: 'privacy-rubric-1';
  readonly promptVersion: '3';
  readonly language: string;
  readonly evidence: readonly ModelPolicyEvidence[];
  readonly classifications: readonly PolicyClassification[];
  readonly summaryFacts: readonly PolicySummaryFact[];
  readonly actions: readonly PolicyAction[];
}

export interface VerifiedPolicyModelAnalysis extends Omit<PolicyModelAnalysis, 'evidence'> {
  readonly evidence: readonly PolicyEvidence[];
}

export interface PolicyScoreResult {
  readonly practiceRisk: number | null;
  readonly finalRisk: number | null;
  readonly coverage: number;
  readonly grade: Grade | null;
  readonly confidence: AssessmentConfidence;
  readonly triggeredRules: readonly string[];
}
