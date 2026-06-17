import { type Result, ok, err } from '../../shared/result';

/** UI locales we ship message bundles for. Analysis can target any language. */
export const SUPPORTED_UI_LOCALES = ['en', 'de', 'es', 'fr', 'zh'] as const;
export type SupportedUiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

const TAG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

/**
 * A BCP-47-ish language tag value object. Normalises case and exposes the
 * primary subtag so callers can pick a UI bundle while preserving the full tag
 * (e.g. "pt-BR") for prompting the LLM in the user's exact locale.
 */
export class Language {
  private constructor(public readonly tag: string) {}

  static parse(input: string): Result<Language, Error> {
    const trimmed = input.trim();
    if (!TAG_RE.test(trimmed)) {
      return err(new Error(`Invalid language tag: "${input}"`));
    }
    const parts = trimmed.split('-');
    // primary subtag lower-case, region subtag upper-case — canonical-ish form
    const canonical = parts
      .map((p, i) => (i === 0 ? p.toLowerCase() : p.length === 2 ? p.toUpperCase() : p.toLowerCase()))
      .join('-');
    return ok(new Language(canonical));
  }

  /** Lenient constructor for trusted internal callers; falls back to English. */
  static fromOrDefault(input: string | null | undefined, fallback: Language = Language.english()): Language {
    if (!input) return fallback;
    const parsed = Language.parse(input);
    return parsed.ok ? parsed.value : fallback;
  }

  static english(): Language {
    return new Language('en');
  }

  get primary(): string {
    return this.tag.split('-')[0]!.toLowerCase();
  }

  get uiLocale(): SupportedUiLocale {
    const p = this.primary;
    return (SUPPORTED_UI_LOCALES as readonly string[]).includes(p)
      ? (p as SupportedUiLocale)
      : 'en';
  }

  get isSupportedUi(): boolean {
    return (SUPPORTED_UI_LOCALES as readonly string[]).includes(this.primary);
  }

  equals(other: Language): boolean {
    return this.tag === other.tag;
  }

  toString(): string {
    return this.tag;
  }
}
