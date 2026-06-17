import { Language } from '../domain/value-objects/language';
import type { LanguageDetector } from '../domain/ports/detection';
import type { SettingsRepository } from '../domain/ports/repositories';

export interface LanguageHints {
  readonly navigatorLanguages?: readonly string[];
  readonly documentLang?: string | null;
  readonly sampleText?: string;
}

/**
 * Decides the language for UI/analysis: an explicit settings override always
 * wins; otherwise the detector infers it from the environment. Centralised so
 * the popup, background and content script all agree.
 */
export class ResolveLanguage {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly detector: LanguageDetector,
  ) {}

  async execute(hints: LanguageHints): Promise<Language> {
    const cfg = await this.settings.load();
    if (cfg.languageOverride) {
      return Language.fromOrDefault(cfg.languageOverride);
    }
    return this.detector.detect(hints);
  }
}
