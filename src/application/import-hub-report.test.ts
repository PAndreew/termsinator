import { describe, expect, it } from 'vitest';
import { ImportHubReport } from './import-hub-report';
import { FakeHubClient, FixedClock, InMemoryAssessmentRepository } from '../test-support/fakes';
import { riskAssessment } from '../test-support/policy-fixtures';

describe('ImportHubReport', () => {
  it('retrieves the selected model report and persists it locally', async () => {
    const hub = new FakeHubClient(); hub.report = { id: 7, origin: 'https://example.com', documentSetHash: 'a'.repeat(64), language: 'en',
      analysisSchemaVersion: '3', promptVersion: '3',
      provider: 'openai', model: 'model-a', grade: 'D', score: 60, coverage: 1, confidence: 'high', issueCount: 1, actionCount: 1, createdAt: 1,
      assessment: riskAssessment({ grade: 'D', score: 60, practiceRisk: 60,
        provenance: { mode: 'llm', provider: 'openai', model: 'model-a' } }) };
    const repo = new InMemoryAssessmentRepository(); const result = await new ImportHubReport(hub, repo, new FixedClock(10)).execute(7, 'https://example.com', 'Example');
    expect(result.ok && result.value.assessment?.provenance).toMatchObject({ mode: 'hub', model: 'model-a' });
    expect((await repo.get('https://example.com'))?.termsHash).toBe('a'.repeat(64));
  });

  it('rejects reports using an unsupported schema or prompt version', async () => {
    const hub = new FakeHubClient(); hub.report = { id: 8, origin: 'https://example.com', documentSetHash: 'b'.repeat(64), language: 'en',
      analysisSchemaVersion: '999', promptVersion: '999',
      provider: 'openai', model: 'future-model', grade: 'D', score: 60, coverage: 1, confidence: 'high', issueCount: 0, actionCount: 0, createdAt: 1,
      assessment: riskAssessment({ grade: 'D', score: 60, practiceRisk: 60,
        provenance: { mode: 'llm', provider: 'openai', model: 'future-model' } }) };
    const repo = new InMemoryAssessmentRepository();

    const result = await new ImportHubReport(hub, repo, new FixedClock(10)).execute(8, 'https://example.com', 'Example');

    expect(result.ok).toBe(false);
    expect(await repo.get('https://example.com')).toBeNull();
  });
});
