import { type Result, ok, err } from '../../shared/result';
import { isLegalFramework, frameworkLabel } from '../../domain/value-objects/legal-framework';
import type { AnalysisRequest, LlmAnalysis, LlmFrameworkVerdict, LlmAnalysisFlag } from '../../domain/ports/analysis';

const JSON_SHAPE =
  '{"frameworks":[{"framework":"gdpr","score":0,"rationale":"..."}],' +
  '"redFlags":[{"id":"slug","messageKey":"flag.slug","affects":["gdpr"],"weight":0,"evidence":"quote"}],' +
  '"summaryLines":["l1","l2","l3","l4","l5"]}';

/**
 * Provider-agnostic prompt construction and response parsing. Keeping this here
 * (not in each vendor adapter) means every backend asks for — and is parsed
 * into — the exact same structured verdict, satisfying the LlmAnalyzer contract.
 *
 * When `request.isSynthesis` is true the prompts switch to a synthesis mode that
 * asks the model to merge N partial chunk analyses rather than read raw text.
 */
export function buildSystemPrompt(request: AnalysisRequest): string {
  if (request.isSynthesis) {
    return [
      'You are a privacy and consumer-rights analyst. You have received partial risk analyses',
      'of consecutive sections of one long Terms of Service / Privacy Policy document.',
      '',
      'Synthesize them into ONE final risk assessment:',
      '- Average framework scores, weighting higher scores more heavily.',
      '- Merge red flags; keep a flag if it appears in any section.',
      '- Do not invent findings that are absent from all partial analyses.',
      '',
      `Write a plain-language, non-alarmist 5-line summary in the language "${request.language.tag}".`,
      '',
      'Respond with ONLY a JSON object, no markdown, of the shape:',
      JSON_SHAPE,
    ].join('\n');
  }

  const frameworks = request.frameworks.map((f) => `- ${f} (${frameworkLabel(f)})`).join('\n');
  return [
    'You are a privacy and consumer-rights analyst. You read website Terms of Service and',
    'Privacy Policies and assess the RISK they pose to an ordinary user.',
    '',
    'Score each of these frameworks from 0 (no concern) to 100 (severe risk):',
    frameworks,
    '',
    `Write a plain-language, non-alarmist summary a layperson understands, in the language`,
    `identified by the BCP-47 tag "${request.language.tag}". Exactly 5 short lines.`,
    '',
    'Respond with ONLY a JSON object, no markdown, of the shape:',
    JSON_SHAPE,
  ].join('\n');
}

export function buildUserPrompt(request: AnalysisRequest): string {
  if (request.isSynthesis) {
    const synthText = request.documents[0]?.text ?? '';
    return `Synthesize these partial analyses into one final assessment:\n\n${synthText}`;
  }

  const docs = request.documents
    .map((d) => `# ${d.kind.toUpperCase()} — ${d.title}\nURL: ${d.url}\n\n${d.text}`)
    .join('\n\n---\n\n');
  return `Analyse the following document(s):\n\n${docs}`;
}

/**
 * Parses a model's raw text into a validated LlmAnalysis. Tolerates code fences
 * and surrounding prose by extracting the first balanced JSON object, then
 * coerces/validates every field defensively (models are not always obedient).
 */
export function parseAnalysis(raw: string): Result<LlmAnalysis, Error> {
  const json = extractJsonObject(raw);
  if (json === null) return err(new Error('No JSON object found in model response'));

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return err(new Error(`Model response was not valid JSON: ${String(e)}`));
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return err(new Error('Model response JSON was not an object'));
  }

  const obj = parsed as Record<string, unknown>;
  const frameworks = coerceFrameworks(obj.frameworks);
  const redFlags = coerceFlags(obj.redFlags);
  const summaryLines = coerceSummary(obj.summaryLines);

  if (frameworks.length === 0 && summaryLines.length === 0) {
    return err(new Error('Model response contained no usable frameworks or summary'));
  }
  return ok({ frameworks, redFlags, summaryLines });
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function coerceFrameworks(value: unknown): LlmFrameworkVerdict[] {
  if (!Array.isArray(value)) return [];
  const out: LlmFrameworkVerdict[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.framework !== 'string' || !isLegalFramework(o.framework)) continue;
    out.push({
      framework: o.framework,
      score: clampScore(o.score),
      rationale: typeof o.rationale === 'string' ? o.rationale : '',
    });
  }
  return out;
}

function coerceFlags(value: unknown): LlmAnalysisFlag[] {
  if (!Array.isArray(value)) return [];
  const out: LlmAnalysisFlag[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string') continue;
    const affects = Array.isArray(o.affects)
      ? o.affects.filter((a): a is string => typeof a === 'string' && isLegalFramework(a))
      : [];
    out.push({
      id: o.id,
      messageKey: typeof o.messageKey === 'string' ? o.messageKey : `flag.${o.id}`,
      affects: affects as LlmAnalysisFlag['affects'],
      weight: clampScore(o.weight),
      evidence: typeof o.evidence === 'string' ? o.evidence.slice(0, 200) : '',
    });
  }
  return out;
}

function coerceSummary(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 5);
}
