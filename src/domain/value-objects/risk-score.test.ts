import { describe, it, expect } from 'vitest';
import { RiskScore } from './risk-score';

describe('RiskScore', () => {
  it('rejects out-of-range and non-finite values', () => {
    expect(RiskScore.of(-1).ok).toBe(false);
    expect(RiskScore.of(101).ok).toBe(false);
    expect(RiskScore.of(NaN).ok).toBe(false);
  });

  it('rounds accepted values', () => {
    const r = RiskScore.of(42.6);
    expect(r.ok && r.value.value).toBe(43);
  });

  it('clamps rather than failing', () => {
    expect(RiskScore.clamp(-20).value).toBe(0);
    expect(RiskScore.clamp(250).value).toBe(100);
    expect(RiskScore.clamp(Number.POSITIVE_INFINITY).value).toBe(100);
  });

  it('derives bands at the documented thresholds', () => {
    expect(RiskScore.clamp(0).band).toBe('low');
    expect(RiskScore.clamp(24).band).toBe('low');
    expect(RiskScore.clamp(25).band).toBe('moderate');
    expect(RiskScore.clamp(49).band).toBe('moderate');
    expect(RiskScore.clamp(50).band).toBe('high');
    expect(RiskScore.clamp(74).band).toBe('high');
    expect(RiskScore.clamp(75).band).toBe('severe');
    expect(RiskScore.clamp(100).band).toBe('severe');
  });

  it('compares severity', () => {
    expect(RiskScore.clamp(80).isWorseThan(RiskScore.clamp(20))).toBe(true);
    expect(RiskScore.clamp(20).isWorseThan(RiskScore.clamp(80))).toBe(false);
  });
});
