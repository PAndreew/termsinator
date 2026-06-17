import { describe, it, expect } from 'vitest';
import { ScoreAggregator } from './score-aggregator';
import { makeRedFlag } from '../value-objects/red-flag';
import { Language } from '../value-objects/language';
import { LEGAL_FRAMEWORKS } from '../value-objects/legal-framework';
import type { AnalysisProvenance } from '../entities/risk-assessment';
import type { LlmAnalysis } from '../ports/analysis';

const agg = new ScoreAggregator();
const heuristicProv: AnalysisProvenance = { mode: 'heuristic', provider: null, model: null };
const llmProv: AnalysisProvenance = { mode: 'llm', provider: 'openai', model: 'gpt-x' };

describe('ScoreAggregator', () => {
  it('returns all-zero, low bands and no summary with no flags and no LLM', () => {
    const r = agg.aggregate({
      redFlags: [],
      llm: null,
      frameworks: LEGAL_FRAMEWORKS,
      language: Language.english(),
      provenance: heuristicProv,
      now: 1,
    });
    expect(r.overall.value).toBe(0);
    expect(r.overall.band).toBe('low');
    expect(r.summaryLines).toEqual([]);
    expect(r.frameworks).toHaveLength(LEGAL_FRAMEWORKS.length);
  });

  it('saturates multiple flag weights without exceeding 100', () => {
    const r = agg.aggregate({
      // ccpa gets weights 75 and 35 -> 1-(0.25*0.65)=0.8375 -> 84
      redFlags: [
        makeRedFlag('a', 'k', ['ccpa'], 75, 'e'),
        makeRedFlag('b', 'k', ['ccpa'], 35, 'e'),
      ],
      llm: null,
      frameworks: ['ccpa'],
      language: Language.english(),
      provenance: heuristicProv,
      now: 1,
    });
    expect(r.frameworks[0]!.score.value).toBe(84);
    expect(r.frameworks[0]!.score.band).toBe('severe');
  });

  it('blends LLM and heuristic scores 60/40 when both are present', () => {
    const llm: LlmAnalysis = {
      frameworks: [{ framework: 'gdpr', score: 100, rationale: 'because' }],
      redFlags: [],
      summaryLines: ['line 1', 'line 2'],
    };
    const r = agg.aggregate({
      redFlags: [makeRedFlag('a', 'k', ['gdpr'], 50, 'e')], // heuristic = 50
      llm,
      frameworks: ['gdpr'],
      language: Language.english(),
      provenance: llmProv,
      now: 1,
    });
    // 0.6*100 + 0.4*50 = 80
    expect(r.frameworks[0]!.score.value).toBe(80);
    expect(r.frameworks[0]!.rationale).toBe('because');
  });

  it('keeps at most 5 summary lines from the LLM', () => {
    const llm: LlmAnalysis = {
      frameworks: [],
      redFlags: [],
      summaryLines: ['1', '2', '3', '4', '5', '6', '7'],
    };
    const r = agg.aggregate({
      redFlags: [],
      llm,
      frameworks: ['gdpr'],
      language: Language.fromOrDefault('de'),
      provenance: llmProv,
      now: 1,
    });
    expect(r.summaryLines).toEqual(['1', '2', '3', '4', '5']);
    expect(r.language).toBe('de');
  });

  it('merges LLM red flags, de-duplicating by id', () => {
    const llm: LlmAnalysis = {
      frameworks: [],
      redFlags: [
        { id: 'a', messageKey: 'k', affects: ['gdpr'], weight: 10, evidence: 'llm' },
        { id: 'z', messageKey: 'k2', affects: ['gdpr'], weight: 20, evidence: 'new' },
      ],
      summaryLines: [],
    };
    const r = agg.aggregate({
      redFlags: [makeRedFlag('a', 'k', ['gdpr'], 99, 'deterministic')],
      llm,
      frameworks: ['gdpr'],
      language: Language.english(),
      provenance: llmProv,
      now: 1,
    });
    const a = r.redFlags.find((f) => f.id === 'a');
    expect(r.redFlags.map((f) => f.id).sort()).toEqual(['a', 'z']);
    expect(a!.evidence).toBe('deterministic'); // deterministic wins on conflict
  });

  it('overall leans toward the worst framework', () => {
    const r = agg.aggregate({
      redFlags: [makeRedFlag('a', 'k', ['ccpa'], 90, 'e')],
      llm: null,
      frameworks: ['common_sense', 'gdpr', 'ccpa', 'data_sharing', 'data_retention'],
      language: Language.english(),
      provenance: heuristicProv,
      now: 1,
    });
    // only ccpa scores 90, others 0 -> 0.6*90 + 0.4*(90/5) = 54 + 7.2 = 61
    expect(r.overall.value).toBe(61);
    expect(r.overall.band).toBe('high');
  });
});
