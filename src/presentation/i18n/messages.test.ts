import { describe, it, expect } from 'vitest';
import { translate } from './messages';
import { SUPPORTED_UI_LOCALES } from '../../domain/value-objects/language';

const FLAG_KEYS = [
  'flag.sells_personal_data',
  'flag.vague_trusted_partners',
  'flag.broad_third_party_sharing',
  'flag.indefinite_retention',
  'flag.forced_arbitration',
  'flag.class_action_waiver',
  'flag.unilateral_changes',
  'flag.train_on_user_data',
  'flag.prechecked_consent',
  'flag.biometric_data',
  'flag.sells_to_brokers',
  'flag.missing_do_not_sell',
];

describe('i18n translate', () => {
  it('substitutes named parameters', () => {
    expect(translate('en', 'popup.usingKey', { provider: 'OpenAI' })).toBe('Analyzed with OpenAI');
  });

  it('falls back to English for a locale missing a key', () => {
    // 'app.name' only defined in en; de should fall back to it.
    expect(translate('de', 'app.name')).toBe('Termsinator');
  });

  it('falls back to the raw key when entirely unknown', () => {
    expect(translate('en', 'totally.unknown.key')).toBe('totally.unknown.key');
  });

  it('translates every red-flag message in every supported locale', () => {
    for (const locale of SUPPORTED_UI_LOCALES) {
      for (const key of FLAG_KEYS) {
        const value = translate(locale, key);
        expect(value, `${locale}:${key}`).not.toBe(key); // i.e. a real translation exists (en at least)
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});
