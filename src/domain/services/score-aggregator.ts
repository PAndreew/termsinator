import type { TermsDocument } from '../entities/terms-document';
import type { VerifiedPolicyModelAnalysis, PolicyAction, PolicyClassification, PolicyEvidence } from '../entities/policy-analysis';
import type { AnalysisProvenance, RiskAssessment } from '../entities/risk-assessment';
import type { LlmAnalysis } from '../ports/analysis';
import type { Language } from '../value-objects/language';
import type { RedFlag } from '../value-objects/red-flag';
import { PolicyRiskScorer } from './policy-risk-scorer';
import { PRIVACY_ATTRIBUTES, type PrivacyAttributeId } from './privacy-attribute-registry';

export interface AggregateInput {
  readonly redFlags: readonly RedFlag[];
  readonly llm: LlmAnalysis | null;
  readonly documents: readonly TermsDocument[];
  readonly language: Language;
  readonly provenance: AnalysisProvenance;
  readonly now: number;
}

export class ScoreAggregator {
  constructor(private readonly scorer = new PolicyRiskScorer()) {}

  aggregate(input: AggregateInput): RiskAssessment {
    const model = input.llm?.kind === 'policy_analysis'
      ? input.llm
      : heuristicAnalysis(input.redFlags, input.documents, input.language.tag);
    const score = this.scorer.score(model.classifications);
    return {
      schemaVersion: '3',
      rubricVersion: 'privacy-rubric-1',
      promptVersion: '3',
      grade: score.grade,
      score: score.finalRisk,
      practiceRisk: score.practiceRisk,
      coverage: score.coverage,
      confidence: score.confidence,
      evidence: model.evidence,
      classifications: model.classifications,
      summaryFacts: model.summaryFacts,
      actions: model.actions,
      triggeredRules: score.triggeredRules,
      language: input.language.tag,
      provenance: input.provenance,
      createdAt: input.now,
    };
  }
}

const FLAG_ATTRIBUTE: Readonly<Record<string, { id: PrivacyAttributeId; state: 3 | 4 }>> = {
  syncs_contacts: { id: 'collection.non_users', state: 4 },
  collects_precise_location: { id: 'data.precise_location', state: 4 },
  accesses_microphone: { id: 'data.communications_and_content', state: 3 },
  accesses_photo_library: { id: 'data.communications_and_content', state: 3 },
  train_on_user_data: { id: 'purpose.ai_training', state: 4 },
  sells_personal_data: { id: 'sharing.sale_or_commercial_transfer', state: 4 },
  vague_trusted_partners: { id: 'transparency.recipient_specificity', state: 3 },
  broad_third_party_sharing: { id: 'sharing.onward_transfer_control', state: 3 },
  indefinite_retention: { id: 'retention.period_specificity', state: 4 },
  unilateral_changes: { id: 'transparency.policy_changes', state: 4 },
  prechecked_consent: { id: 'control.consent_and_defaults', state: 4 },
};

function heuristicAnalysis(
  flags: readonly RedFlag[],
  documents: readonly TermsDocument[],
  language: string,
): VerifiedPolicyModelAnalysis {
  const evidence: PolicyEvidence[] = [];
  const found = new Map<PrivacyAttributeId, { refs: string[]; state: 3 | 4 }>();
  for (const flag of flags) {
    const mapping = FLAG_ATTRIBUTE[flag.id];
    if (!mapping || !flag.evidence) continue;
    const documentIndex = documents.findIndex((document) => document.text.includes(flag.evidence));
    if (documentIndex < 0) continue;
    const document = documents[documentIndex]!;
    const startOffset = document.text.indexOf(flag.evidence);
    const evidenceId = `heuristic-${evidence.length + 1}`;
    evidence.push({
      evidenceId,
      documentId: `doc-${documentIndex + 1}`,
      documentUrl: document.url,
      quote: flag.evidence,
      startOffset,
      endOffset: startOffset + flag.evidence.length,
    });
    const existing = found.get(mapping.id);
    found.set(mapping.id, {
      refs: [...(existing?.refs ?? []), evidenceId],
      state: Math.max(existing?.state ?? 3, mapping.state) as 3 | 4,
    });
  }
  const classifications: PolicyClassification[] = PRIVACY_ATTRIBUTES.map((attribute) => {
    const finding = found.get(attribute.id);
    return {
      attributeId: attribute.id,
      state: finding?.state ?? 'unknown',
      confidence: finding ? 'direct' : 'uncertain',
      rationale: finding ? 'Detected by the local phrase scanner.' : 'Not assessed without a model analysis.',
      evidenceRefs: finding?.refs ?? [],
      conflict: false,
    };
  });
  return {
    kind: 'policy_analysis',
    schemaVersion: '3',
    rubricVersion: 'privacy-rubric-1',
    promptVersion: '3',
    language,
    evidence,
    classifications,
    summaryFacts: [],
    actions: heuristicActions(found),
  };
}

function heuristicActions(found: ReadonlyMap<PrivacyAttributeId, { readonly refs: readonly string[] }>): PolicyAction[] {
  const definitions: Array<[PrivacyAttributeId, PolicyAction['kind'], string, string[], boolean?]> = [
    ['collection.non_users', 'revoke_permission', 'Stop contact syncing', ['Disable Contacts permission in your device settings.', 'Delete contacts already uploaded using the service privacy controls.']],
    ['data.precise_location', 'revoke_permission', 'Restrict precise location', ['Set location access to Never or While Using.', 'Disable Precise Location for this service.']],
    ['data.communications_and_content', 'revoke_permission', 'Restrict content access', ['Disable microphone and full photo-library access unless the feature is needed.', 'Remove sensitive recordings or uploads you no longer need.']],
    ['purpose.ai_training', 'opt_out', 'Stop model-training use', ['Disable model training or product improvement in data controls.', 'Delete sensitive prior uploads where deletion is available.']],
    ['sharing.sale_or_commercial_transfer', 'opt_out', 'Opt out of data sale or sharing', ['Use the service privacy controls to opt out of sale or sharing.', 'Delete the account if the commercial transfer cannot be disabled.']],
    ['transparency.recipient_specificity', 'contact_privacy_team', 'Identify who receives your data', ['Ask the privacy contact for the categories and identities of recipients.', 'Avoid supplying additional sensitive data until the recipients are clear.']],
    ['sharing.onward_transfer_control', 'limit_input', 'Limit data shared with third parties', ['Disable optional sharing or analytics controls.', 'Remove optional profile data that recipients do not need.']],
    ['retention.period_specificity', 'delete_data', 'Remove data kept without a clear deadline', ['Export anything you need to retain.', 'Request deletion of stored data you no longer need and keep the confirmation.'], true],
    ['transparency.policy_changes', 'monitor_policy', 'Watch for material policy changes', ['Enable policy or account notifications.', 'Review changed privacy terms before continuing to use the service.']],
    ['control.consent_and_defaults', 'withdraw_consent', 'Turn off default optional processing', ['Open privacy or consent settings.', 'Disable preselected optional processing and withdraw existing consent.']],
  ];
  return definitions.flatMap(([attributeId, kind, title, steps, destructive = false], index) => {
    const finding = found.get(attributeId);
    if (!finding) return [];
    return [{
      actionId: `heuristic-action-${index + 1}`,
      linkedAttributeIds: [attributeId],
      evidenceRefs: finding.refs,
      urgency: 'soon',
      kind,
      impact: 'high',
      effort: 'medium',
      title,
      why: 'This reduces an intrusive practice detected in the policy.',
      steps,
      destructive,
    } satisfies PolicyAction];
  });
}
