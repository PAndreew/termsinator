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
import type { HubConsensus } from '../domain/ports/hub';
import { contentHash } from '../domain/services/content-hash';
import { policyModel, riskAssessment } from '../test-support/policy-fixtures';

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
  const analysis: LlmAnalysis = policyModel({
    language: 'de',
    summaryFacts: [{ text: 'They sell your data.', attributeIds: ['sharing.sale_or_commercial_transfer'], evidenceRefs: [] }],
  });
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
    expect(result.value.assessment?.classifications.find((item) => item.attributeId === 'sharing.sale_or_commercial_transfer')?.state).toBe(4);
    expect(result.value.assessment?.summaryFacts).toEqual([]);
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
    expect(result.value.assessment?.summaryFacts.length).toBeGreaterThan(0);
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
    const hubAssessmentBase: HubConsensus = {
      reusable: true, confidence: 'moderate', contributorCount: 3, modelCount: 2,
      overallScore: 80, frameworkScores: {}, disagreement: 10, findings: [],
    };

    it('does not automatically replace local analysis with consensus', async () => {
      const hubClient = new FakeHubClient(hubAssessmentBase);
      const settings = new InMemorySettingsRepository({
        ...DEFAULT_SETTINGS,
        shareAnalyses: true,
        hubUrl: 'https://hub.example',
      });
      const { deps } = makeDeps({ settings, hubClient });

      const result = await new AnalyzeSiteTerms(deps).execute(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assessment?.provenance.mode).toBe('heuristic');
      expect(hubClient.lookupCalls).toHaveLength(0);
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
      });
      const { deps } = makeDeps({ settings, hubClient });

      const result = await new AnalyzeSiteTerms(deps).execute(input);
      expect(result.ok).toBe(true);
      // submit is fire-and-forget; wait a tick for the void promise
      await Promise.resolve();
      expect(hubClient.submitCalls).toHaveLength(1);
      expect(hubClient.submitCalls[0]!.key.language).toBe('de');
    });

    it('keeps execution alive until the hub submission settles', async () => {
      let release!: () => void;
      const hubClient = new FakeHubClient();
      hubClient.submitPromise = new Promise<void>((resolve) => { release = resolve; });
      const settings = new InMemorySettingsRepository({
        ...DEFAULT_SETTINGS,
        shareAnalyses: true,
        hubUrl: 'https://hub.example',
      });
      const { deps } = makeDeps({ settings, hubClient });

      let settled = false;
      const execution = new AnalyzeSiteTerms(deps).execute(input).then((value) => {
        settled = true;
        return value;
      });
      for (let attempt = 0; attempt < 20 && hubClient.submitCalls.length === 0; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      expect(hubClient.submitCalls).toHaveLength(1);
      expect(settled).toBe(false);
      release();
      await execution;
      expect(settled).toBe(true);
    });

    it('skips hub lookup when alwaysRefresh=true', async () => {
      const hubClient = new FakeHubClient(hubAssessmentBase);
      const settings = new InMemorySettingsRepository({
        ...DEFAULT_SETTINGS,
        shareAnalyses: true,
        hubUrl: 'https://hub.example',
        alwaysRefresh: true,
      });
      const { deps } = makeDeps({ settings, hubClient });
      await new AnalyzeSiteTerms(deps).execute(input);
      expect(hubClient.lookupCalls).toHaveLength(0);
    });
  });

  describe('local cache and termsHash', () => {
    it('stores termsHash and policyUrls in the saved assessment', async () => {
      const { deps, repo } = makeDeps();
      const result = await new AnalyzeSiteTerms(deps).execute(input);
      expect(result.ok).toBe(true);
      const saved = await repo.get(input.origin);
      expect(saved?.termsHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
      expect(saved?.policyUrls).toEqual([PRIVACY_URL]);
    });

    it('returns the cached local assessment when termsHash matches (skips LLM)', async () => {
      const { deps, vault, repo, analyzer } = makeDeps();
      const secret = 'sk-abc';
      await vault.add({
        id: 'openai:1',
        provider: 'openai',
        kind: 'api_key',
        secret,
        masked: '…abc',
        sourceHost: 'platform.openai.com',
        createdAt: 1,
      });

      // First analysis — LLM called once
      const first = await new AnalyzeSiteTerms(deps).execute(input);
      expect(first.ok).toBe(true);
      expect(analyzer.requests).toHaveLength(1);

      // Second analysis — same document content → same hash → cache hit, LLM NOT called again
      const second = await new AnalyzeSiteTerms(deps).execute(input);
      expect(second.ok).toBe(true);
      expect(analyzer.requests).toHaveLength(1); // still 1, not 2
      if (!second.ok || !first.ok) return;
      expect(second.value.termsHash).toBe(first.value.termsHash);
    });

    it('re-analyses when alwaysRefresh=true even with matching termsHash', async () => {
      const { deps, vault, repo, analyzer } = makeDeps({
        settings: new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, alwaysRefresh: true }),
      });
      await vault.add({
        id: 'openai:1',
        provider: 'openai',
        kind: 'api_key',
        secret: 'sk-abc',
        masked: '…abc',
        sourceHost: 'platform.openai.com',
        createdAt: 1,
      });

      await new AnalyzeSiteTerms(deps).execute(input);
      await new AnalyzeSiteTerms(deps).execute(input);
      expect(analyzer.requests).toHaveLength(2); // re-analysed both times
    });

    it('re-analyses unchanged documents when the selected model changes', async () => {
      const settings = new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, modelOverride: null });
      const { deps, vault, analyzer } = makeDeps({ settings });
      await vault.add({ id: 'openai:1', provider: 'openai', kind: 'api_key', secret: 'sk-abc', masked: '…abc', sourceHost: 'manual', createdAt: 1 });
      await new AnalyzeSiteTerms(deps).execute(input);
      settings.current = { ...settings.current, modelOverride: 'different-model' };
      await new AnalyzeSiteTerms(deps).execute(input);
      expect(analyzer.requests).toHaveLength(2);
    });

    it('does not treat an imported hub report as a local cache hit', async () => {
      const { deps, repo } = makeDeps();
      await repo.save({
        origin: input.origin,
        title: input.title,
        status: 'ready',
        documents: [],
        assessment: riskAssessment({
          grade: 'F', score: 80, practiceRisk: 80, language: 'de',
          summaryFacts: [{ text: 'Imported report', attributeIds: ['sharing.sale_or_commercial_transfer'], evidenceRefs: [] }],
          provenance: { mode: 'hub', provider: null, model: 'remote-model' },
        }),
        error: null,
        updatedAt: 1,
        termsHash: await contentHash(['We may sell your personal information to data brokers and advertisers.']),
        policyUrls: [],
      });

      const result = await new AnalyzeSiteTerms(deps).execute(input);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assessment?.provenance.mode).toBe('heuristic');
      expect(result.value.documents).toHaveLength(1);
      expect(result.value.updatedAt).toBe(42);
    });
  });
});
