import { describe, expect, it } from 'vitest';
import { PolicyRiskScorer } from './policy-risk-scorer';
import { PRIVACY_ATTRIBUTES, type PrivacyAttributeId } from './privacy-attribute-registry';
import type { PolicyClassification } from '../entities/policy-analysis';

function classifications(state: PolicyClassification['state']): PolicyClassification[] {
  return PRIVACY_ATTRIBUTES.map((attribute) => ({
    attributeId: attribute.id,
    state,
    confidence: state === 'unknown' ? 'uncertain' : 'direct',
    rationale: state === 'unknown' ? 'Not disclosed in the supplied documents.' : 'Explicitly disclosed.',
    evidenceRefs: state === 'unknown' ? [] : [`ev-${attribute.id}`],
    conflict: false,
  }));
}

function setState(
  values: PolicyClassification[],
  attributeId: PrivacyAttributeId,
  state: PolicyClassification['state'],
): PolicyClassification[] {
  return values.map((item) => item.attributeId === attributeId
    ? { ...item, state, confidence: 'direct', evidenceRefs: [`ev-${attributeId}`] }
    : item);
}

describe('PolicyRiskScorer', () => {
  it('assigns A to complete, explicitly protective disclosures', () => {
    const result = new PolicyRiskScorer().score(classifications(0));
    expect(result).toMatchObject({
      practiceRisk: 0,
      finalRisk: 0,
      coverage: 1,
      grade: 'A',
      confidence: 'high',
    });
  });

  it('caps the best result at B when one critical attribute is unknown', () => {
    const values = setState(classifications(0), 'data.precise_location', 'unknown');
    const result = new PolicyRiskScorer().score(values);
    expect(result.finalRisk).toBe(15);
    expect(result.grade).toBe('B');
    expect(result.triggeredRules).toContain('disclosure.one_critical_unknown');
  });

  it('assigns F when sensitive data is combined with intrusive advertising', () => {
    let values = setState(classifications(0), 'data.sensitive_traits', 3);
    values = setState(values, 'purpose.advertising', 3);
    const result = new PolicyRiskScorer().score(values);
    expect(result.finalRisk).toBeGreaterThanOrEqual(70);
    expect(result.grade).toBe('F');
    expect(result.triggeredRules).toContain('severe.sensitive_commercial_use');
  });

  it('withholds a grade when no applicable attribute is known', () => {
    const result = new PolicyRiskScorer().score(classifications('unknown'));
    expect(result.practiceRisk).toBeNull();
    expect(result.finalRisk).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.coverage).toBe(0);
  });
});
