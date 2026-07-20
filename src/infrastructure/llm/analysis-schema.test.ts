import { describe, expect, it } from 'vitest';
import { parseAndValidatePolicyAnalysis } from './analysis-schema';
import { PRIVACY_ATTRIBUTES } from '../../domain/services/privacy-attribute-registry';
import type { TermsDocument } from '../../domain/entities/terms-document';

const documents: TermsDocument[] = [{
  url: 'https://example.com/privacy',
  kind: 'privacy',
  title: 'Privacy',
  text: 'We do not sell personal data. Account deletion removes profile data.',
  approxTokens: 15,
}];

function validOutput(): Record<string, unknown> {
  return {
    kind: 'policy_analysis',
    schemaVersion: '3',
    rubricVersion: 'privacy-rubric-1',
    promptVersion: '3',
    language: 'en',
    evidence: [{
      evidenceId: 'ev-1',
      documentId: 'doc-1',
      documentUrl: documents[0]!.url,
      quote: 'We do not sell personal data.',
      context: 'The policy denies sale.',
    }],
    classifications: PRIVACY_ATTRIBUTES.map((attribute) => ({
      attributeId: attribute.id,
      state: 0,
      confidence: 'direct',
      rationale: 'The supplied clause is explicitly protective.',
      evidenceRefs: ['ev-1'],
      conflict: false,
    })),
    summaryFacts: [1, 2, 3].map((id) => ({
      text: `Protective disclosure ${id}.`,
      attributeIds: ['sharing.sale_or_commercial_transfer'],
      evidenceRefs: ['ev-1'],
    })),
    actions: [],
  };
}

describe('schema-3 policy analysis parsing', () => {
  it('resolves exact evidence offsets against supplied documents', () => {
    const result = parseAndValidatePolicyAnalysis(JSON.stringify(validOutput()), documents);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.evidence[0]).toMatchObject({
      startOffset: 0,
      endOffset: 29,
    });
    expect(result.value.classifications).toHaveLength(43);
  });

  it('rejects model-generated scores and grades as unknown properties', () => {
    const output = { ...validOutput(), score: 5, grade: 'A' };
    const result = parseAndValidatePolicyAnalysis(JSON.stringify(output), documents);
    expect(result.ok).toBe(false);
  });

  it('rejects incomplete attribute sets', () => {
    const output = validOutput();
    (output.classifications as unknown[]).pop();
    const result = parseAndValidatePolicyAnalysis(JSON.stringify(output), documents);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('classification');
  });

  it('rejects evidence that is not an exact document substring', () => {
    const output = validOutput();
    (output.evidence as Array<Record<string, unknown>>)[0]!.quote = 'We never sell anything.';
    const result = parseAndValidatePolicyAnalysis(JSON.stringify(output), documents);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('quote');
  });

  it('rejects unknown states that cite fabricated evidence', () => {
    const output = validOutput();
    const first = (output.classifications as Array<Record<string, unknown>>)[0]!;
    first.state = 'unknown';
    const result = parseAndValidatePolicyAnalysis(JSON.stringify(output), documents);
    expect(result.ok).toBe(false);
  });
});
