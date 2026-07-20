import { describe, it, expect } from 'vitest';
import { SyncToHub } from './sync-to-hub';
import {
  InMemoryAssessmentRepository,
  InMemorySettingsRepository,
  FakeHubClient,
} from '../test-support/fakes';
import { DEFAULT_SETTINGS, type Settings } from '../domain/entities/settings';
import type { SiteAssessment } from '../domain/entities/site-assessment';
import type { RiskAssessment } from '../domain/entities/risk-assessment';
import { riskAssessment } from '../test-support/policy-fixtures';

const mockAssessment = (overrides: Partial<RiskAssessment> = {}): RiskAssessment => riskAssessment({
  grade: 'D', score: 60, practiceRisk: 60,
  summaryFacts: [{ text: 'They sell data.', attributeIds: ['sharing.sale_or_commercial_transfer'], evidenceRefs: [] }],
  provenance: { mode: 'llm', provider: 'openai', model: 'gpt-4' },
  createdAt: 100,
  ...overrides,
});

const readySite = (origin: string, termsHash: string | null = 'hash-abc'): SiteAssessment => ({
  origin,
  title: 'T',
  status: 'ready',
  documents: [],
  assessment: mockAssessment(),
  error: null,
  updatedAt: 200,
  termsHash,
  policyUrls: [`${origin}/privacy`],
});

const sharingSettings: Settings = {
  ...DEFAULT_SETTINGS,
  shareAnalyses: true,
  hubUrl: 'https://hub.example',
};

describe('SyncToHub', () => {
  it('does nothing when sharing is disabled', async () => {
    const repo = new InMemoryAssessmentRepository();
    const hub = new FakeHubClient(null);
    const settings = new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, shareAnalyses: false });
    await repo.save(readySite('https://a.example'));

    const sync = new SyncToHub({ repo, hubClient: hub, settings });
    const result = await sync.execute();

    expect(result.submitted).toBe(0);
    expect(hub.submitCalls).toHaveLength(0);
  });

  it('does nothing when hubUrl is missing', async () => {
    const repo = new InMemoryAssessmentRepository();
    const hub = new FakeHubClient(null);
    const settings = new InMemorySettingsRepository({
      ...DEFAULT_SETTINGS,
      shareAnalyses: true,
      hubUrl: null,
    });
    await repo.save(readySite('https://a.example'));

    const sync = new SyncToHub({ repo, hubClient: hub, settings });
    const result = await sync.execute();

    expect(result.submitted).toBe(0);
  });

  it('submits a ready assessment when hub has nothing', async () => {
    const repo = new InMemoryAssessmentRepository();
    const hub = new FakeHubClient(null);
    const settings = new InMemorySettingsRepository(sharingSettings);
    await repo.save(readySite('https://a.example', 'hash-abc'));

    const sync = new SyncToHub({ repo, hubClient: hub, settings });
    const result = await sync.execute();

    expect(result.submitted).toBe(1);
    expect(hub.submitCalls).toHaveLength(1);
    expect(hub.submitCalls[0]!.key.documentSetHash).toBe('hash-abc');
  });

  it('does not resubmit a report that was imported from the hub', async () => {
    const repo = new InMemoryAssessmentRepository();
    await repo.save({ ...readySite('https://imported.example'), assessment: mockAssessment({
      provenance: { mode: 'hub', provider: null, model: 'remote-model' },
    }) });
    const hub = new FakeHubClient(null);
    const settings = new InMemorySettingsRepository(sharingSettings);

    const result = await new SyncToHub({ repo, hubClient: hub, settings }).execute();

    expect(result).toEqual({ submitted: 0, skipped: 1 });
    expect(hub.submitCalls).toHaveLength(0);
  });

  it('skips assessments without termsHash (pre-sync era)', async () => {
    const repo = new InMemoryAssessmentRepository();
    const hub = new FakeHubClient(null);
    const settings = new InMemorySettingsRepository(sharingSettings);
    await repo.save(readySite('https://a.example', null));

    const sync = new SyncToHub({ repo, hubClient: hub, settings });
    const result = await sync.execute();

    expect(result.submitted).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips non-ready assessments', async () => {
    const repo = new InMemoryAssessmentRepository();
    const hub = new FakeHubClient(null);
    const settings = new InMemorySettingsRepository(sharingSettings);
    await repo.save({
      ...readySite('https://a.example'),
      status: 'error',
      assessment: null,
    });

    const sync = new SyncToHub({ repo, hubClient: hub, settings });
    const result = await sync.execute();

    expect(result.submitted).toBe(0);
  });

  it('re-submits when consensus exists because persistence is contributor-idempotent', async () => {
    const repo = new InMemoryAssessmentRepository();
    const hubResult = { reusable: true as const, confidence: 'moderate' as const, contributorCount: 2,
      modelCount: 1, overallScore: 60, frameworkScores: {}, disagreement: 0, findings: [] };
    const hub = new FakeHubClient(hubResult);
    const settings = new InMemorySettingsRepository(sharingSettings);
    // local updatedAt=200, hub analyzedAt=300 → hub is newer
    await repo.save(readySite('https://a.example'));

    const sync = new SyncToHub({ repo, hubClient: hub, settings });
    const result = await sync.execute();

    expect(result.submitted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(hub.submitCalls).toHaveLength(1);
  });

  it('does not use schema-2 consensus lookup as a duplicate check', async () => {
    const repo = new InMemoryAssessmentRepository();
    const hubResult = { reusable: true as const, confidence: 'moderate' as const, contributorCount: 2,
      modelCount: 1, overallScore: 60, frameworkScores: {}, disagreement: 0, findings: [] };
    const hub = new FakeHubClient(hubResult);
    const settings = new InMemorySettingsRepository(sharingSettings);
    // local updatedAt=200, hub analyzedAt=50 → we are newer
    await repo.save(readySite('https://a.example'));

    const sync = new SyncToHub({ repo, hubClient: hub, settings });
    const result = await sync.execute();

    expect(result.submitted).toBe(1);
    expect(hub.lookupCalls).toHaveLength(0);
  });

  it('submits multiple sites in one pass', async () => {
    const repo = new InMemoryAssessmentRepository();
    const hub = new FakeHubClient(null);
    const settings = new InMemorySettingsRepository(sharingSettings);
    await repo.save(readySite('https://a.example', 'hash-a'));
    await repo.save(readySite('https://b.example', 'hash-b'));

    const sync = new SyncToHub({ repo, hubClient: hub, settings });
    const result = await sync.execute();

    expect(result.submitted).toBe(2);
    expect(hub.submitCalls).toHaveLength(2);
  });

  it('does not finish until each submission settles', async () => {
    let release!: () => void;
    const repo = new InMemoryAssessmentRepository();
    const hub = new FakeHubClient(null);
    hub.submitPromise = new Promise<void>((resolve) => { release = resolve; });
    const settings = new InMemorySettingsRepository(sharingSettings);
    await repo.save(readySite('https://a.example', 'hash-a'));

    let settled = false;
    const execution = new SyncToHub({ repo, hubClient: hub, settings }).execute().then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hub.submitCalls).toHaveLength(1);
    expect(settled).toBe(false);
    release();
    await execution;
    expect(settled).toBe(true);
  });
});
