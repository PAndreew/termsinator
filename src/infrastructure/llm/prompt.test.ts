import { describe, it, expect } from 'vitest';
import { parseAnalysis, buildSystemPrompt, buildUserPrompt } from './prompt';
import { Language } from '../../domain/value-objects/language';
import { LEGAL_FRAMEWORKS } from '../../domain/value-objects/legal-framework';
import type { AnalysisRequest } from '../../domain/ports/analysis';

const request: AnalysisRequest = {
  documents: [{ url: 'https://x/p', kind: 'privacy', title: 'P', text: 'some terms', approxTokens: 3 }],
  language: Language.fromOrDefault('de'),
  frameworks: LEGAL_FRAMEWORKS,
};

describe('prompt building', () => {
  it('asks for the target language and all frameworks', () => {
    const sys = buildSystemPrompt(request);
    expect(sys).toContain('"de"');
    for (const f of LEGAL_FRAMEWORKS) expect(sys).toContain(f);
    expect(sys).toContain('5 short lines');
  });

  it('embeds document text in the user prompt', () => {
    expect(buildUserPrompt(request)).toContain('some terms');
    expect(buildUserPrompt(request)).toContain('PRIVACY');
  });
});

describe('parseAnalysis', () => {
  it('parses a clean JSON response', () => {
    const r = parseAnalysis(
      JSON.stringify({
        frameworks: [{ framework: 'gdpr', score: 80, rationale: 'shares broadly' }],
        redFlags: [{ id: 'x', messageKey: 'flag.x', affects: ['gdpr'], weight: 50, evidence: 'q' }],
        summaryLines: ['a', 'b', 'c', 'd', 'e'],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.frameworks[0]).toEqual({ framework: 'gdpr', score: 80, rationale: 'shares broadly' });
    expect(r.value.summaryLines).toHaveLength(5);
  });

  it('extracts JSON from markdown code fences and surrounding prose', () => {
    const raw = 'Sure! ```json\n{"frameworks":[{"framework":"ccpa","score":"90"}],"summaryLines":["x"]}\n``` done';
    const r = parseAnalysis(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.frameworks[0]?.framework).toBe('ccpa');
    expect(r.value.frameworks[0]?.score).toBe(90); // coerced from string
  });

  it('drops unknown frameworks and clamps scores', () => {
    const r = parseAnalysis(
      JSON.stringify({
        frameworks: [
          { framework: 'martian_law', score: 50 },
          { framework: 'gdpr', score: 999 },
        ],
        summaryLines: ['x'],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.frameworks).toHaveLength(1);
    expect(r.value.frameworks[0]?.score).toBe(100);
  });

  it('caps the summary to 5 lines', () => {
    const r = parseAnalysis(JSON.stringify({ frameworks: [], summaryLines: ['1', '2', '3', '4', '5', '6'] }));
    expect(r.ok && r.value.summaryLines).toEqual(['1', '2', '3', '4', '5']);
  });

  it('fails on responses with no JSON', () => {
    expect(parseAnalysis('I cannot help with that.').ok).toBe(false);
  });

  it('fails on malformed JSON', () => {
    expect(parseAnalysis('{ frameworks: [ ').ok).toBe(false);
  });
});
