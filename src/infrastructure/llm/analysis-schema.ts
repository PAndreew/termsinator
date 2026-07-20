import { z } from 'zod';
import { err, ok, type Result } from '../../shared/result';
import type { TermsDocument } from '../../domain/entities/terms-document';
import type {
  PolicyClassification,
  PolicyModelAnalysis,
  VerifiedPolicyModelAnalysis,
} from '../../domain/entities/policy-analysis';
import {
  PRIVACY_ATTRIBUTES,
  PRIVACY_ATTRIBUTE_BY_ID,
  isPrivacyAttributeId,
} from '../../domain/services/privacy-attribute-registry';

const id = z.string().min(1).max(120);
const attributeId = z.string().refine(isPrivacyAttributeId, 'unknown privacy attribute');
const evidenceRef = z.string().min(1).max(120);
const state = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal('unknown'),
  z.literal('not_applicable'),
]);

const evidenceSchema = z.object({
  evidenceId: id,
  documentId: id,
  documentUrl: z.url().max(2_048),
  quote: z.string().min(10).max(800),
  context: z.string().max(300).optional(),
}).strict();

const classificationSchema = z.object({
  attributeId,
  state,
  confidence: z.enum(['direct', 'inferred', 'uncertain']),
  rationale: z.string().min(20).max(500),
  evidenceRefs: z.array(evidenceRef).max(20),
  conflict: z.boolean(),
}).strict();

const summaryFactSchema = z.object({
  text: z.string().min(1).max(300),
  attributeIds: z.array(attributeId).min(1).max(10),
  evidenceRefs: z.array(evidenceRef).min(1).max(10),
}).strict();

const actionTargetSchema = z.object({
  label: z.string().min(1).max(160),
  url: z.url().max(2_048).optional(),
  settingsPath: z.string().min(1).max(240).optional(),
}).strict();

const actionSchema = z.object({
  actionId: id,
  linkedAttributeIds: z.array(attributeId).min(1).max(10),
  evidenceRefs: z.array(evidenceRef).max(10),
  urgency: z.enum(['immediate', 'soon', 'when_convenient', 'informational']),
  kind: z.enum([
    'disable_setting',
    'revoke_permission',
    'opt_out',
    'withdraw_consent',
    'delete_data',
    'delete_account',
    'request_access',
    'request_correction',
    'contact_privacy_team',
    'limit_input',
    'avoid_sensitive_input',
    'use_alternative',
    'stop_using_service',
    'monitor_policy',
    'investigate_unknown',
  ]),
  impact: z.enum(['high', 'medium', 'low']),
  effort: z.enum(['low', 'medium', 'high']),
  title: z.string().min(1).max(120),
  why: z.string().min(1).max(400),
  steps: z.array(z.string().min(1).max(240)).min(1).max(4),
  target: actionTargetSchema.optional(),
  fallback: z.string().min(1).max(400).optional(),
  destructive: z.boolean(),
}).strict();

export const policyModelAnalysisSchema = z.object({
  kind: z.literal('policy_analysis'),
  schemaVersion: z.literal('3'),
  rubricVersion: z.literal('privacy-rubric-1'),
  promptVersion: z.literal('3'),
  language: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  evidence: z.array(evidenceSchema).max(120),
  classifications: z.array(classificationSchema).length(PRIVACY_ATTRIBUTES.length),
  summaryFacts: z.array(summaryFactSchema).max(5),
  actions: z.array(actionSchema).max(10),
}).strict();

export function parseAndValidatePolicyAnalysis(
  raw: string,
  documents: readonly TermsDocument[],
): Result<VerifiedPolicyModelAnalysis, Error> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return err(new Error(`Model response was not valid JSON: ${String(error)}`));
  }

  const structural = policyModelAnalysisSchema.safeParse(json);
  if (!structural.success) {
    return err(new Error(`Model response failed schema validation: ${z.prettifyError(structural.error)}`));
  }
  const value = structural.data as PolicyModelAnalysis;
  const semanticError = validateSemantics(value);
  if (semanticError) return err(new Error(semanticError));

  const resolved = resolveEvidence(value, documents);
  if (!resolved.ok) return resolved;
  return ok({ ...value, evidence: resolved.value });
}

function validateSemantics(value: PolicyModelAnalysis): string | null {
  const attributeIds = value.classifications.map((item) => item.attributeId);
  if (new Set(attributeIds).size !== PRIVACY_ATTRIBUTES.length) {
    return 'Model response contains duplicate classifications';
  }
  for (const attribute of PRIVACY_ATTRIBUTES) {
    if (!attributeIds.includes(attribute.id)) return `Model response is missing classification: ${attribute.id}`;
  }

  const evidenceIds = new Set<string>();
  for (const evidence of value.evidence) {
    if (evidenceIds.has(evidence.evidenceId)) return `Duplicate evidence ID: ${evidence.evidenceId}`;
    evidenceIds.add(evidence.evidenceId);
  }
  const actionIds = new Set<string>();
  for (const action of value.actions) {
    if (actionIds.has(action.actionId)) return `Duplicate action ID: ${action.actionId}`;
    actionIds.add(action.actionId);
  }

  for (const classification of value.classifications) {
    if ((classification.state === 'unknown' || classification.state === 'not_applicable') && classification.evidenceRefs.length !== 0) {
      return `Non-numeric classification must not cite evidence: ${classification.attributeId}`;
    }
    if (typeof classification.state === 'number' && classification.evidenceRefs.length === 0) {
      return `Classification requires evidence: ${classification.attributeId}`;
    }
    const badRef = classification.evidenceRefs.find((ref) => !evidenceIds.has(ref));
    if (badRef) return `Unknown evidence reference ${badRef} in classification ${classification.attributeId}`;
  }
  for (const fact of value.summaryFacts) {
    const badRef = fact.evidenceRefs.find((ref) => !evidenceIds.has(ref));
    if (badRef) return `Unknown evidence reference ${badRef} in summary fact`;
  }
  const byAttribute = new Map(value.classifications.map((item) => [item.attributeId, item]));
  for (const action of value.actions) {
    const badRef = action.evidenceRefs.find((ref) => !evidenceIds.has(ref));
    if (badRef) return `Unknown evidence reference ${badRef} in action ${action.actionId}`;
    if (action.kind === 'investigate_unknown') {
      if (action.linkedAttributeIds.some((item) => byAttribute.get(item)?.state !== 'unknown')) {
        return `investigate_unknown action must link only unknown attributes: ${action.actionId}`;
      }
    } else if (action.evidenceRefs.length === 0) {
      return `Action requires evidence: ${action.actionId}`;
    }
    if (action.urgency === 'immediate' && action.destructive && !eligibleImmediateDestructive(action.linkedAttributeIds, byAttribute)) {
      return `Immediate destructive action lacks eligible direct evidence: ${action.actionId}`;
    }
    if (action.urgency === 'immediate' && action.destructive &&
        (action.steps.length < 2 || !action.fallback || !warnsIrreversible(action))) {
      return `Immediate destructive action lacks safeguards: ${action.actionId}`;
    }
  }
  return null;
}

function warnsIrreversible(action: PolicyModelAnalysis['actions'][number]): boolean {
  return /\b(irrevers|permanent|cannot be undone|lose access|data loss)\b/i.test(
    [action.why, ...action.steps].join(' '),
  );
}

function eligibleImmediateDestructive(
  ids: readonly string[],
  classifications: ReadonlyMap<string, PolicyClassification>,
): boolean {
  return ids.some((idValue) => {
    if (!isPrivacyAttributeId(idValue)) return false;
    const attribute = PRIVACY_ATTRIBUTE_BY_ID.get(idValue);
    const classification = classifications.get(idValue);
    return attribute?.critical && classification?.state === 4 && classification.confidence === 'direct';
  });
}

function resolveEvidence(
  value: PolicyModelAnalysis,
  documents: readonly TermsDocument[],
): Result<VerifiedPolicyModelAnalysis['evidence'], Error> {
  const docs = new Map(documents.map((document, index) => [`doc-${index + 1}`, document]));
  const resolved: Array<VerifiedPolicyModelAnalysis['evidence'][number]> = [];
  for (const evidence of value.evidence) {
    const document = docs.get(evidence.documentId);
    if (!document || document.url !== evidence.documentUrl) {
      return err(new Error(`Evidence references an unknown document: ${evidence.evidenceId}`));
    }
    const startOffset = document.text.indexOf(evidence.quote);
    if (startOffset < 0) return err(new Error(`Evidence quote not found in document: ${evidence.evidenceId}`));
    if (document.text.lastIndexOf(evidence.quote) !== startOffset) {
      return err(new Error(`Evidence quote is ambiguous in document: ${evidence.evidenceId}`));
    }
    resolved.push({
      ...evidence,
      startOffset,
      endOffset: startOffset + evidence.quote.length,
    });
  }
  return ok(resolved);
}
