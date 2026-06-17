import { describe, it, expect } from 'vitest';
import { AnalyzeSiteTerms, type AnalyzeSiteDeps, type AnalyzeSiteInput } from './analyze-site-terms';
import {
  InMemoryAssessmentRepository,
  InMemorySettingsRepository,
  InMemoryKeyVault,
  FakeFetcher,
  PassthroughSanitizer,
  FixedLanguageDetector,
  FakeLlmAnalyzer,
  FakeLlmAnalyzerFactory,
  FixedClock,
  NullLogger,
  FakeHubClient,
} from '../test-support/fakes';
import { ok } from '../shared/result';
import { Language } from '../domain/value-objects/language';
import { maskSecret } from '../domain/entities/provider-key';
import { DEFAULT_SETTINGS } from '../domain/entities/settings';
import type { LlmAnalysis } from '../domain/ports/analysis';
import type { HubLookupResult } from '../domain/ports/hub';

const PRIVACY_URL = 'https://acme.example/privacy';
const SELLING_TEXT = '<p>We may sell your personal information to data brokers and advertisers.</p>';

function makeDeps(overrides: Partial<AnalyzeSiteDeps> = {}): {
  deps: AnalyzeSiteDeps;
  fetcher: FakeFetcher;
  repo: InMemoryAssessmentRepository;
  vault: InMemoryKeyVault;
  factory: FakeLlmAnalyzerFactory;
  analyzer: FakeLlmAnalyzer;
} {
  const fetcher = new FakeFetcher();
  fetcher.setHtml(PRIVACY_URL, SELLING_TEXT);
  const repo = new InMemoryAssessmentRepository();
  const vault = new InMemoryKeyVault();
  const analysis: LlmAnalysis = {
    frameworks: [
      { framework: 'gdpr', score: 70, rationale: 'broad sharing' },
      { framework: 'ccpa', score: 90, rationale: 'sells data' },
    ],
    redFlags: [],
    summaryLines: ['They sell your data.', 'They keep it a long time.'],
  };
  const analyzer = new FakeLlmAnalyzer('OpenAI', 'gpt-x', ok(analysis));
  const factory = new FakeLlmAnalyzerFactory(analyzer);
  const deps: AnalyzeSiteDeps = {
    fetcher,
    sanitizer: new PassthroughSanitizer(),
    analyzerFactory: factory,
    keyVault: vault,
    settings: new InMemorySettingsRepository(),
    languageDetector: new FixedLanguageDetector(Language.fromOrDefault('de')),
    repo,
    clock: new FixedClock(42),
    logger: new NullLogger(),
    ...overrides,
  };
  return { deps, fetcher, repo, vault, factory, analyzer };
}

const input: AnalyzeSiteInput = {
  origin: 'https://acme.example',
  title: 'Acme',
  candidates: [{ url: PRIVACY_URL, kind: 'privacy', label: 'Privacy', score: 0.9 }],
  navigatorLanguages: ['de-DE'],
  documentLang: 'de',
};

describe('AnalyzeSiteTerms', () => {
  it('produces a heuristic assessment when no BYOK key exists', async () => {
    const { deps, repo } = makeDeps();
    const result = await new AnalyzeSiteTerms(deps).execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('ready');
    expect(result.value.assessment?.provenance.mode).toBe('heuristic');
    // deterministic scanner caught the data sale
    expect(result.value.assessment?.redFlags.some((f) => f.id === 'sells_personal_data')).toBe(true);
    expect(result.value.assessment?.summaryLines).toEqual([]);
    // persisted under origin
    expect((await repo.get(input.origin))?.status).toBe('ready');
  });

  it('uses the BYOK LLM when a key is present and records provenance', async () => {
    const { deps, vault, factory } = makeDeps();
    const secret = 'sk-ant-api03-SECRETVALUE1234';
    await vault.add({
      id: 'anthropic:1',
      provider: 'anthropic',
      kind: 'api_key',
      secret,
      masked: maskSecret(secret),
      sourceHost: 'console.anthropic.com',
      createdAt: 1,
    });

    const result = await new AnalyzeSiteTerms(deps).execute(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(factory.created).toEqual([{ provider: 'anthropic', secret }]);
    expect(result.value.assessment?.provenance).toEqual({
      mode: 'llm',
      provider: 'anthropic',
      model: 'gpt-x',
    });
    // summary comes from the LLM, in the resolved language (de)
    expect(result.value.assessment?.summaryLines.length).toBeGreaterThan(0);
    expect(result.value.assessment?.language).toBe('de');
  });

  it('passes the resolved language to the analyzer', async () => {
    const { deps, vault, analyzer } = makeDeps();
    await vault.add({
      id: 'openai:1',
      provider: 'openai',
      kind: 'api_key',
      secret: 'sk-abc',
      masked: 'sk-…abc',
      sourceHost: 'platform.openai.com',
      createdAt: 1,
    });
    await new AnalyzeSiteTerms(deps).execute(input);
    expect(analyzer.lastRequest?.language.tag).toBe('de');
    expect(analyzer.lastRequest?.documents).toHaveLength(1);
  });

  it('honours an explicit language override from settings', async () => {
    const settings = new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, languageOverride: 'fr' });
    const { deps } = makeDeps({ settings });
    const result = await new AnalyzeSiteTerms(deps).execute(input);
    expect(result.ok && result.value.assessment?.language).toBe('fr');
  });

  it('falls back to heuristics when the LLM call fails', async () => {
    const { deps, vault } = makeDeps({
      analyzerFactory: new FakeLlmAnalyzerFactory(
        new FakeLlmAnalyzer('OpenAI', 'gpt-x', { ok: false, error: new Error('429') }),
      ),
    });
    await vault.add({
      id: 'openai:1',
      provider: 'openai',
      kind: 'api_key',
      secret: 'sk-abc',
      masked: 'sk-…abc',
      sourceHost: 'platform.openai.com',
      createdAt: 1,
    });
    const result = await new AnalyzeSiteTerms(deps).execute(input);
    expect(result.ok && result.value.assessment?.provenance.mode).toBe('heuristic');
  });

  it('errors and stores an error assessment when no candidates are given', async () => {
    const { deps, repo } = makeDeps();
    const result = await new AnalyzeSiteTerms(deps).execute({ ...input, candidates: [] });
    expect(result.ok).toBe(false);
    expect((await repo.get(input.origin))?.status).toBe('error');
  });

  it('errors when every fetch fails', async () => {
    const fetcher = new FakeFetcher();
    fetcher.setError(PRIVACY_URL, 'network down');
    const { deps } = makeDeps({ fetcher });
    const result = await new AnalyzeSiteTerms(deps).execute(input);
    expect(result.ok).toBe(false);
  });

  describe('hub integration', () => {
    const hubAssessmentBase: HubLookupResult = {
      isFresh: true,
      provider: 'anthropic',
      model: 'claude-3',
      analyzedAt: 10,
      assessment: {
        overall: { score: 80, band: 'high', label: 'High Risk' },
        frameworks: [],
        redFlags: [],
        summaryLines: ['Hub cached result.'],
        language: 'en',
        provenance: { mode: 'llm', provider: 'anthropic', model: 'claude-3' },
        createdAt: 10,
      },
    };

    it('returns hub-cached result when fresh and shareAnalyses=true', async () => {
      const hubClient = new FakeHubClient(hubAssessmentBase);
      const settings = new InMemorySettingsRepository({
        ...DEFAULT_SETTINGS,
        shareAnalyses: true,
        hubUrl: 'https://hub.example',
        installationId: 'test-id',
      });
      const { deps } = makeDeps({ settings, hubClient });

      const result = await new AnalyzeSiteTerms(deps).execute(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assessment?.provenance.mode).toBe('hub');
      expect(result.value.assessment?.summaryLines).toEqual(['Hub cached result.']);
      expect(hubClient.lookupCalls).toHaveLength(1);
    });

    it('does not call hub when shareAnalyses=false', async () => {
      const hubClient = new FakeHubClient(hubAssessmentBase);
      const { deps } = makeDeps({ hubClient });
      await new AnalyzeSiteTerms(deps).execute(input);
      expect(hubClient.lookupCalls).toHaveLength(0);
    });

    it('submits to hub after local analysis when shareAnalyses=true', async () => {
      const hubClient = new FakeHubClient(null);
      const settings = new InMemorySettingsRepository({
        ...DEFAULT_SETTINGS,
        shareAnalyses: true,
        hubUrl: 'https://hub.example',
        installationId: 'inst-xyz',
      });
      const { deps } = makeDeps({ settings, hubClient });

      const result = await new AnalyzeSiteTerms(deps).execute(input);
      expect(result.ok).toBe(true);
      // submit is fire-and-forget; wait a tick for the void promise
      await Promise.resolve();
      expect(hubClient.submitCalls).toHaveLength(1);
      expect(hubClient.submitCalls[0].origin).toBe(input.origin);
    });

    it('skips hub lookup when alwaysRefresh=true', async () => {
      const hubClient = new FakeHubClient(hubAssessmentBase);
      const settings = new InMemorySettingsRepository({
        ...DEFAULT_SETTINGS,
        shareAnalyses: true,
        hubUrl: 'https://hub.example',
        installationId: 'inst-xyz',
        alwaysRefresh: true,
      });
      const { deps } = makeDeps({ settings, hubClient });
      await new AnalyzeSiteTerms(deps).execute(input);
      expect(hubClient.lookupCalls).toHaveLength(0);
    });
  });
});
