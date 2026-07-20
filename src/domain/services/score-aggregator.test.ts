import { describe, expect, it } from 'vitest';
import { ScoreAggregator, type AggregateInput } from './score-aggregator';
import { Language } from '../value-objects/language';
import { makeRedFlag } from '../value-objects/red-flag';
import { policyModel, unknownClassifications } from '../../test-support/policy-fixtures';

const document = { url: 'https://example.com/privacy', kind: 'privacy' as const, title: 'Privacy', text: 'We upload your contacts.', approxTokens: 10 };
const base: AggregateInput = {
  redFlags: [],
  llm: null,
  documents: [document],
  language: Language.english(),
  provenance: { mode: 'heuristic', provider: null, model: null },
  now: 1,
};

describe('ScoreAggregator schema-v3 model', () => {
  it('withholds a grade when the fallback has no verified finding', () => {
    expect(new ScoreAggregator().aggregate(base).grade).toBeNull();
  });

  it('maps a scanner finding to evidence, an attribute, an action, and deterministic risk', () => {
    const redFlags = [makeRedFlag('syncs_contacts', 'flag.syncs_contacts', ['data_sharing'], 90, 'upload your contacts')];
    const result = new ScoreAggregator().aggregate({ ...base, redFlags });
    expect(result.grade).toBe('F');
    expect(result.classifications.find((item) => item.attributeId === 'collection.non_users')?.state).toBe(4);
    expect(result.evidence[0]?.quote).toBe('upload your contacts');
    expect(result.actions[0]?.title).toContain('contact');
  });

  it('calculates the score from model classifications and preserves structured actions', () => {
    const evidence = { evidenceId: 'e1', documentId: 'doc-1', documentUrl: document.url, quote: document.text, startOffset: 0, endOffset: document.text.length };
    const action = {
      actionId: 'a1', linkedAttributeIds: ['control.consent_and_defaults'] as const, evidenceRefs: ['e1'],
      urgency: 'soon' as const, kind: 'opt_out' as const, impact: 'high' as const, effort: 'low' as const,
      title: 'Disable optional processing', why: 'It is enabled by default.', steps: ['Open privacy settings.', 'Turn it off.'], destructive: false,
    };
    const llm = policyModel({
      evidence: [evidence],
      classifications: unknownClassifications({
        'control.consent_and_defaults': { state: 4, confidence: 'direct', evidenceRefs: ['e1'] },
      }),
      actions: [action],
    });
    const result = new ScoreAggregator().aggregate({ ...base, llm });
    expect(result.grade).toBe('F');
    expect(result.actions).toEqual([action]);
  });
});
