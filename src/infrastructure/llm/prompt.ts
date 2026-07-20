import { type Result, err, ok } from '../../shared/result';
import type { AnalysisRequest, LlmAnalysis, UrlDiscoveryAnalysis } from '../../domain/ports/analysis';
import { promptAttributeCatalog } from '../../domain/services/privacy-attribute-registry';
import { parseAndValidatePolicyAnalysis } from './analysis-schema';

const DISCOVERY_SHAPE = '{"terms":"https://example.com/terms-or-null","privacy":"https://example.com/privacy-or-null"}';

export function buildSystemPrompt(request: AnalysisRequest): string {
  if (request.isUrlDiscovery) {
    return [
      'Identify the Terms of Service and Privacy Policy URLs in the supplied URL list.',
      'Use only supplied URLs. Use null when a page cannot be identified.',
      `Return exactly one JSON object with no markdown or prose: ${DISCOVERY_SHAPE}`,
    ].join('\n');
  }

  const mode = request.isSynthesis ? 'evidence_synthesis' : 'full';
  return [
    'You are an evidence extractor and privacy-practice classifier.',
    'You do not calculate scores, grades, weighted totals, thresholds, or legal compliance verdicts.',
    `Mode: ${mode}. Output language: ${request.language.tag}.`,
    '',
    'Return exactly one JSON object. Do not use markdown, code fences, comments, or surrounding prose.',
    'The root object must contain only: kind, schemaVersion, rubricVersion, promptVersion, language, evidence, classifications, summaryFacts, actions.',
    'Use kind="policy_analysis", schemaVersion="3", rubricVersion="privacy-rubric-1", promptVersion="3".',
    '',
    'Evidence rules:',
    '- Every quote must be an exact, contiguous substring of the identified source document.',
    '- Use the supplied documentId and documentUrl exactly. Never normalize or invent URLs.',
    '- One evidence item may support several classifications. Keep quotes short and decisive.',
    '- Numeric states require at least one evidenceRef. unknown and not_applicable require no evidenceRefs.',
    '',
    'Classification rules:',
    '- Return each catalog attribute exactly once.',
    '- state is 0, 1, 2, 3, 4, "unknown", or "not_applicable".',
    '- confidence is "direct", "inferred", or "uncertain".',
    '- Use unknown when the supplied material does not establish the practice. Absence of text is not state 0.',
    '- Use not_applicable only when the service context makes the attribute genuinely irrelevant.',
    '- conflict is true when supplied clauses materially conflict.',
    '- Interpolate states 1-3 between each attribute state0Anchor and state4Anchor.',
    '',
    'Action rules:',
    '- Actions must be concrete, linked to classified attributes, and supported by evidence when based on a disclosed workflow.',
    '- Valid kinds: disable_setting, revoke_permission, opt_out, withdraw_consent, delete_data, delete_account, request_access, request_correction, contact_privacy_team, limit_input, avoid_sensitive_input, use_alternative, stop_using_service, monitor_policy, investigate_unknown.',
    '- A destructive immediate action must include at least two steps and a fallback. Explicitly warn about irreversible consequences in why or steps.',
    '- Strong actions such as deleting data/account or stopping use are allowed when proportionate. Do not soften a necessary action.',
    '',
    'Attribute catalog (weights and scoring rules are intentionally omitted):',
    JSON.stringify(promptAttributeCatalog()),
    '',
    'Required structural example (values are illustrative, not findings):',
    '{"kind":"policy_analysis","schemaVersion":"3","rubricVersion":"privacy-rubric-1","promptVersion":"3","language":"en","evidence":[],"classifications":[{"attributeId":"data.basic_identifiers","state":"unknown","confidence":"uncertain","rationale":"Not established in supplied text.","evidenceRefs":[],"conflict":false}],"summaryFacts":[],"actions":[]}',
  ].join('\n');
}

export function buildUserPrompt(request: AnalysisRequest): string {
  if (request.isUrlDiscovery) {
    return `URL list:\n${request.documents[0]?.text ?? ''}`;
  }
  if (request.isSynthesis) {
    const manifest = (request.sourceDocuments ?? [])
      .map((document, index) => ({ documentId: `doc-${index + 1}`, documentUrl: document.url, title: document.title }));
    return [
      'Produce the final classification from the verified candidate package below.',
      'Do not invent evidence. Copy only candidate quotes and assign their global documentId from the manifest URL match.',
      `Source manifest: ${JSON.stringify(manifest)}`,
      `Candidate package: ${request.documents[0]?.text ?? '[]'}`,
    ].join('\n\n');
  }
  const documents = request.documents.map((document, index) => ({
    documentId: `doc-${index + 1}`,
    documentUrl: document.url,
    kind: document.kind,
    title: document.title,
    text: document.text,
  }));
  return `Classify these policy documents:\n${JSON.stringify(documents)}`;
}

export function parseAnalysis(raw: string, request: AnalysisRequest): Result<LlmAnalysis, Error> {
  if (request.isUrlDiscovery) return parseDiscovery(raw, request);
  const parsed = parseAndValidatePolicyAnalysis(raw, request.sourceDocuments ?? request.documents);
  if (parsed.ok && parsed.value.language !== request.language.tag) {
    return err(new Error(`Model response language ${parsed.value.language} does not match requested language ${request.language.tag}`));
  }
  return parsed;
}

function parseDiscovery(raw: string, request: AnalysisRequest): Result<UrlDiscoveryAnalysis, Error> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (error) {
    return err(new Error(`Model response was not valid JSON: ${String(error)}`));
  }
  if (!isRecord(parsed) || !Object.keys(parsed).every((key) => key === 'terms' || key === 'privacy')) {
    return err(new Error('Invalid URL discovery response'));
  }
  const terms = parseDiscoveryUrl(parsed.terms);
  const privacy = parseDiscoveryUrl(parsed.privacy);
  const allowed = new Set((request.documents[0]?.text ?? '').split(/\s+/).filter(Boolean).map(normalizeUrl));
  if ((terms && !allowed.has(terms)) || (privacy && !allowed.has(privacy))) {
    return err(new Error('URL discovery response contained a URL outside the supplied list'));
  }
  return ok({
    kind: 'url_discovery',
    discoveredUrls: { terms, privacy },
  });
}

function parseDiscoveryUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUrl(value: string): string {
  try { return new URL(value).href; } catch { return ''; }
}
