import { describe, it, expect } from 'vitest';
import { NavigatorLanguageDetector } from './navigator-language-detector';

const d = new NavigatorLanguageDetector();

describe('NavigatorLanguageDetector', () => {
  it('prefers navigator languages', () => {
    expect(d.detect({ navigatorLanguages: ['de-DE', 'en'] }).tag).toBe('de-DE');
  });

  it('skips invalid navigator entries', () => {
    expect(d.detect({ navigatorLanguages: ['', 'garbage!', 'fr-FR'] }).tag).toBe('fr-FR');
  });

  it('falls back to the document lang', () => {
    expect(d.detect({ navigatorLanguages: [], documentLang: 'es' }).primary).toBe('es');
  });

  it('uses a script heuristic when nothing else is available', () => {
    expect(d.detect({ sampleText: '这是隐私政策' }).primary).toBe('zh');
    expect(d.detect({ sampleText: 'Политика конфиденциальности' }).primary).toBe('ru');
  });

  it('defaults to English', () => {
    expect(d.detect({}).tag).toBe('en');
  });
});
