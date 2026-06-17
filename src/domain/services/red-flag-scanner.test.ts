import { describe, it, expect } from 'vitest';
import { RedFlagScanner } from './red-flag-scanner';

const scanner = new RedFlagScanner();
const ids = (text: string) => scanner.scan(text).map((f) => f.id).sort();

describe('RedFlagScanner', () => {
  it('finds nothing in a benign policy', () => {
    const text = 'We respect your privacy. We only use your email to send the newsletter you requested.';
    expect(scanner.scan(text)).toHaveLength(0);
  });

  it('detects sale of personal data and the missing opt-out', () => {
    const text = 'We may sell your personal information to advertisers to fund our service.';
    const found = ids(text);
    expect(found).toContain('sells_personal_data');
    expect(found).toContain('missing_do_not_sell');
  });

  it('does not raise missing_do_not_sell when an opt-out is offered', () => {
    const text =
      'We sell your personal data to partners. You can use our Do Not Sell or Share My Personal Information link.';
    const found = ids(text);
    expect(found).toContain('sells_personal_data');
    expect(found).not.toContain('missing_do_not_sell');
  });

  it('flags vague partners, broad sharing and indefinite retention', () => {
    const text =
      'We share your data with third parties including our trusted partners, and we retain it indefinitely.';
    const found = ids(text);
    expect(found).toContain('vague_trusted_partners');
    expect(found).toContain('broad_third_party_sharing');
    expect(found).toContain('indefinite_retention');
  });

  it('flags arbitration, class-action waiver and unilateral changes', () => {
    const text =
      'Disputes are subject to binding arbitration. You agree to a class-action waiver. ' +
      'We may modify these terms at any time.';
    const found = ids(text);
    expect(found).toContain('forced_arbitration');
    expect(found).toContain('class_action_waiver');
    expect(found).toContain('unilateral_changes');
  });

  it('flags training on user data and biometrics', () => {
    const text = 'We use your content to train our models. We may collect biometric identifiers.';
    const found = ids(text);
    expect(found).toContain('train_on_user_data');
    expect(found).toContain('biometric_data');
  });

  it('captures a short evidence snippet for transparency', () => {
    const flags = scanner.scan('We may sell your personal information to anyone.');
    const flag = flags.find((f) => f.id === 'sells_personal_data');
    expect(flag?.evidence.length).toBeGreaterThan(0);
    expect(flag?.evidence.length).toBeLessThanOrEqual(200);
  });

  it('reports each pattern at most once', () => {
    const text = 'We sell personal data. We sell personal data again. We sell personal data thrice.';
    const sells = scanner.scan(text).filter((f) => f.id === 'sells_personal_data');
    expect(sells).toHaveLength(1);
  });
});
