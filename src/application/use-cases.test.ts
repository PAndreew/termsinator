import { describe, it, expect } from 'vitest';
import { ResolveLanguage } from './resolve-language';
import { GetOrCreateAssessment } from './get-or-create-assessment';
import { SaveSettings } from './save-settings';
import {
  InMemorySettingsRepository,
  InMemoryAssessmentRepository,
  FixedLanguageDetector,
  FixedClock,
} from '../test-support/fakes';
import { Language } from '../domain/value-objects/language';
import { DEFAULT_SETTINGS } from '../domain/entities/settings';

describe('ResolveLanguage', () => {
  it('prefers the settings override over detection', async () => {
    const settings = new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, languageOverride: 'es' });
    const uc = new ResolveLanguage(settings, new FixedLanguageDetector(Language.fromOrDefault('zh')));
    const lang = await uc.execute({ navigatorLanguages: ['zh-CN'] });
    expect(lang.tag).toBe('es');
  });

  it('falls back to the detector when no override is set', async () => {
    const settings = new InMemorySettingsRepository();
    const uc = new ResolveLanguage(settings, new FixedLanguageDetector(Language.fromOrDefault('zh')));
    const lang = await uc.execute({ navigatorLanguages: ['zh-CN'] });
    expect(lang.uiLocale).toBe('zh');
  });
});

describe('GetOrCreateAssessment', () => {
  it('returns an idle placeholder when nothing is stored', async () => {
    const repo = new InMemoryAssessmentRepository();
    const uc = new GetOrCreateAssessment(repo, new FixedClock(5));
    const a = await uc.execute('https://x.example', 'X');
    expect(a.status).toBe('idle');
    expect(a.updatedAt).toBe(5);
  });

  it('returns the stored assessment when present', async () => {
    const repo = new InMemoryAssessmentRepository();
    await repo.save({
      origin: 'https://x.example',
      title: 'X',
      status: 'ready',
      documents: [],
      assessment: null,
      error: null,
      updatedAt: 1,
      termsHash: null,
      policyUrls: [],
    });
    const uc = new GetOrCreateAssessment(repo, new FixedClock(5));
    expect((await uc.execute('https://x.example', 'X')).status).toBe('ready');
  });
});

describe('SaveSettings', () => {
  it('merges a patch onto current settings', async () => {
    const repo = new InMemorySettingsRepository();
    const r = await new SaveSettings(repo).execute({ autoToast: false });
    expect(r.ok && r.value.autoToast).toBe(false);
    expect(r.ok && r.value.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
    expect(repo.current.autoToast).toBe(false);
  });

  it('rejects an out-of-range token budget', async () => {
    const repo = new InMemorySettingsRepository();
    expect((await new SaveSettings(repo).execute({ maxTokens: 10 })).ok).toBe(false);
    expect((await new SaveSettings(repo).execute({ maxTokens: 999999 })).ok).toBe(false);
  });

  it('rejects an invalid language override but accepts null', async () => {
    const repo = new InMemorySettingsRepository();
    expect((await new SaveSettings(repo).execute({ languageOverride: 'not a tag' })).ok).toBe(false);
    expect((await new SaveSettings(repo).execute({ languageOverride: null })).ok).toBe(true);
    expect((await new SaveSettings(repo).execute({ languageOverride: 'pt-BR' })).ok).toBe(true);
  });
});
