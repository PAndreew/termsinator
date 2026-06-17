import { describe, it, expect } from 'vitest';
import { Language } from './language';

describe('Language', () => {
  it('parses and canonicalises a region tag', () => {
    const r = Language.parse('pt-br');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.tag).toBe('pt-BR');
      expect(r.value.primary).toBe('pt');
    }
  });

  it('rejects garbage tags', () => {
    expect(Language.parse('').ok).toBe(false);
    expect(Language.parse('english').ok).toBe(false);
    expect(Language.parse('e').ok).toBe(false);
    expect(Language.parse('123').ok).toBe(false);
  });

  it('maps to the nearest supported UI locale, defaulting to en', () => {
    expect(Language.fromOrDefault('de-DE').uiLocale).toBe('de');
    expect(Language.fromOrDefault('zh-Hans-CN').uiLocale).toBe('zh');
    expect(Language.fromOrDefault('sv-SE').uiLocale).toBe('en'); // unsupported -> en
    expect(Language.fromOrDefault('sv-SE').isSupportedUi).toBe(false);
  });

  it('falls back to English for empty/invalid input', () => {
    expect(Language.fromOrDefault(null).tag).toBe('en');
    expect(Language.fromOrDefault('not a tag').tag).toBe('en');
  });

  it('supports value equality', () => {
    const a = Language.fromOrDefault('fr-FR');
    const b = Language.fromOrDefault('fr-fr');
    expect(a.equals(b)).toBe(true);
  });
});
