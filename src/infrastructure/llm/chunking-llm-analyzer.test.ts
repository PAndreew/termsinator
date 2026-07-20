import { describe, it, expect } from 'vitest';
import { ok, err } from '../../shared/result';
import { Language } from '../../domain/value-objects/language';
import type { AnalysisRequest } from '../../domain/ports/analysis';
import type { TermsDocument } from '../../domain/entities/terms-document';
import { DocumentChunker } from '../../domain/services/document-chunker';
import { ChunkingLlmAnalyzer } from './chunking-llm-analyzer';
import { FakeLlmAnalyzer } from '../../test-support/fakes';
import { policyModel } from '../../test-support/policy-fixtures';

function makeDoc(approxTokens: number): TermsDocument {
  return {
    url: 'https://example.com/terms',
    kind: 'terms',
    title: 'Terms',
    text: 'word '.repeat(Math.ceil((approxTokens * 4) / 5)),
    approxTokens,
  };
}

function makeRequest(document: TermsDocument, maxTokens: number): AnalysisRequest {
  return { documents: [document], language: Language.english(), maxTokens };
}

describe('ChunkingLlmAnalyzer v3', () => {
  const analysis = policyModel();
  const chunker = new DocumentChunker();

  it('passes a small request through unchanged', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', ok(analysis));
    const result = await new ChunkingLlmAnalyzer(fake, chunker).analyze(makeRequest(makeDoc(60), 100));
    expect(result.ok).toBe(true);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]!.isSynthesis).toBeFalsy();
  });

  it('extracts per chunk and performs one evidence synthesis pass', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', ok(analysis));
    const source = makeDoc(80);
    const result = await new ChunkingLlmAnalyzer(fake, chunker).analyze(makeRequest(source, 100));
    expect(result.ok).toBe(true);
    expect(fake.requests.length).toBeGreaterThanOrEqual(3);
    const synthesis = fake.requests.at(-1)!;
    expect(synthesis.isSynthesis).toBe(true);
    expect(synthesis.sourceDocuments).toEqual([source]);
    expect(synthesis.documents[0]!.text).toContain('"kind":"policy_analysis"');
  });

  it('still synthesizes a single extracted chunk so offsets are resolved against the source', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', ok(analysis));
    const source = { ...makeDoc(80), text: 'short text' };
    await new ChunkingLlmAnalyzer(fake, chunker).analyze(makeRequest(source, 100));
    expect(fake.requests.at(-1)?.isSynthesis).toBe(true);
  });

  it('returns an error when all chunk extractions fail', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', err(new Error('LLM down')));
    const result = await new ChunkingLlmAnalyzer(fake, chunker).analyze(makeRequest(makeDoc(80), 100));
    expect(result.ok).toBe(false);
  });

  it('uses the default token budget and exposes inner metadata', async () => {
    const fake = new FakeLlmAnalyzer('MyProvider', 'my-model', ok(analysis));
    const sut = new ChunkingLlmAnalyzer(fake, chunker);
    await sut.analyze({ documents: [makeDoc(60)], language: Language.english() });
    expect(fake.requests).toHaveLength(1);
    expect(sut.providerLabel).toBe('MyProvider');
    expect(sut.model).toBe('my-model');
  });
});
