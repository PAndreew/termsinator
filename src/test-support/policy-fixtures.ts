import type { VerifiedPolicyModelAnalysis, PolicyClassification } from '../domain/entities/policy-analysis';
import type { RiskAssessment } from '../domain/entities/risk-assessment';
import { PRIVACY_ATTRIBUTES, type PrivacyAttributeId } from '../domain/services/privacy-attribute-registry';

export function unknownClassifications(
  changes: Partial<Record<PrivacyAttributeId, Partial<PolicyClassification>>> = {},
): PolicyClassification[] {
  return PRIVACY_ATTRIBUTES.map((attribute) => ({
    attributeId: attribute.id,
    state: 'unknown',
    confidence: 'uncertain',
    rationale: 'Not established in the supplied policy documents.',
    evidenceRefs: [],
    conflict: false,
    ...changes[attribute.id],
  }));
}

export function policyModel(
  overrides: Partial<VerifiedPolicyModelAnalysis> = {},
): VerifiedPolicyModelAnalysis {
  return {
    kind: 'policy_analysis',
    schemaVersion: '3',
    rubricVersion: 'privacy-rubric-1',
    promptVersion: '3',
    language: 'en',
    evidence: [],
    classifications: unknownClassifications(),
    summaryFacts: [],
    actions: [],
    ...overrides,
  };
}

export function riskAssessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    schemaVersion: '3',
    rubricVersion: 'privacy-rubric-1',
    promptVersion: '3',
    grade: null,
    score: null,
    practiceRisk: null,
    coverage: 0,
    confidence: 'low',
    evidence: [],
    classifications: unknownClassifications(),
    summaryFacts: [],
    actions: [],
    triggeredRules: ['grade.insufficient_known_attributes'],
    language: 'en',
    provenance: { mode: 'heuristic', provider: null, model: null },
    createdAt: 1,
    ...overrides,
  };
}
