import { Language } from '../../domain/value-objects/language';
import type { LanguageDetector } from '../../domain/ports/detection';

/**
 * Infers language from, in priority order: the browser's preferred languages,
 * the document's lang attribute, then a light script-based heuristic on a text
 * sample. Falls back to English. Pure and synchronous so it runs anywhere.
 */
export class NavigatorLanguageDetector implements LanguageDetector {
  detect(hints: {
    navigatorLanguages?: readonly string[];
    documentLang?: string | null;
    sampleText?: string;
  }): Language {
    for (const tag of hints.navigatorLanguages ?? []) {
      const parsed = Language.parse(tag);
      if (parsed.ok) return parsed.value;
    }
    if (hints.documentLang) {
      const parsed = Language.parse(hints.documentLang);
      if (parsed.ok) return parsed.value;
    }
    if (hints.sampleText) {
      const byScript = detectByScript(hints.sampleText);
      if (byScript) return byScript;
    }
    return Language.english();
  }
}

function detectByScript(text: string): Language | null {
  if (/[一-鿿]/.test(text)) return Language.fromOrDefault('zh');
  if (/[぀-ヿ]/.test(text)) return Language.fromOrDefault('ja');
  if (/[가-힯]/.test(text)) return Language.fromOrDefault('ko');
  if (/[Ѐ-ӿ]/.test(text)) return Language.fromOrDefault('ru');
  if (/[؀-ۿ]/.test(text)) return Language.fromOrDefault('ar');
  return null;
}
