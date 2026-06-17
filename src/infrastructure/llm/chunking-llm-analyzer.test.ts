import { describe, it, expect } from 'vitest';
import { ok, err } from '../../shared/result';
import { Language } from '../../domain/value-objects/language';
import { LEGAL_FRAMEWORKS } from '../../domain/value-objects/legal-framework';
import type { LlmAnalysis, AnalysisRequest } from '../../domain/ports/analysis';
import type { TermsDocument } from '../../domain/entities/terms-document';
import { DocumentChunker } from '../../domain/services/document-chunker';
import { ChunkingLlmAnalyzer } from './chunking-llm-analyzer';
import { FakeLlmAnalyzer } from '../../test-support/fakes';

function makeAnalysis(score = 50): LlmAnalysis {
  return {
    frameworks: LEGAL_FRAMEWORKS.map((f) => ({ framework: f, score, rationale: 'test' })),
    redFlags: [
      {
        id: 'test_flag',
        messageKey: 'flag.test_flag',
        affects: ['gdpr'] as LlmAnalysis['redFlags'][0]['affects'],
        weight: score,
        evidence: 'test evidence',
      },
    ],
    summaryLines: ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'],
  };
}

/**
 * Build a TermsDocument whose approxTokens is set explicitly.
 * Text length = approxTokens * 4 chars so the DocumentChunker's char-based
 * splitting agrees with the token estimate.
 */
function makeDoc(approxTokens: number): TermsDocument {
  return {
    url: 'https://example.com/terms',
    kind: 'terms',
    title: 'Terms',
    // 5 chars per word; ≈ 1 word per token at 4 chars/token
    text: 'word '.repeat(Math.ceil((approxTokens * 4) / 5)),
    approxTokens,
  };
}

function makeRequest(doc: TermsDocument, maxTokens: number): AnalysisRequest {
  return {
    documents: [doc],
    language: Language.fromOrDefault('en'),
    frameworks: LEGAL_FRAMEWORKS,
    maxTokens,
  };
}

describe('ChunkingLlmAnalyzer', () => {
  const analysis = makeAnalysis(50);
  const chunker = new DocumentChunker();

  it('passes request through unchanged when totalTokens ≤ threshold', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', ok(analysis));
    const sut = new ChunkingLlmAnalyzer(fake, chunker);
    // maxTokens=100, threshold=70; doc is 60 tokens → no chunking
    const req = makeRequest(makeDoc(60), 100);
    const result = await sut.analyze(req);

    expect(result.ok).toBe(true);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]!.isSynthesis).toBeFalsy();
  });

  it('chunks and synthesizes when totalTokens > maxTokens × 0.7', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', ok(analysis));
    const sut = new ChunkingLlmAnalyzer(fake, chunker);
    // maxTokens=100, threshold=70; doc is 80 tokens → chunk into ≥2 pieces + synthesis
    const req = makeRequest(makeDoc(80), 100);
    const result = await sut.analyze(req);

    expect(result.ok).toBe(true);
    // At least 2 chunk calls + 1 synthesis call
    expect(fake.requests.length).toBeGreaterThanOrEqual(3);
    // Final call is synthesis
    expect(fake.requests[fake.requests.length - 1]!.isSynthesis).toBe(true);
  });

  it('synthesis request carries a single virtual document with formatted partials', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', ok(analysis));
    const sut = new ChunkingLlmAnalyzer(fake, chunker);
    const req = makeRequest(makeDoc(80), 100);
    await sut.analyze(req);

    const synthReq = fake.requests[fake.requests.length - 1]!;
    expect(synthReq.isSynthesis).toBe(true);
    expect(synthReq.documents).toHaveLength(1);
    expect(synthReq.documents[0]!.text).toContain('PART 1');
    expect(synthReq.documents[0]!.text).toContain('PART 2');
  });

  it('skips synthesis and returns the single partial when only one chunk succeeds', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', ok(analysis));
    const sut = new ChunkingLlmAnalyzer(fake, chunker);
    // doc just over threshold so chunker may produce 1 chunk from a borderline text
    // We force 1-chunk scenario by making text barely over threshold in tokens but
    // actually short in chars so the chunker keeps it whole.
    const shortDoc: TermsDocument = {
      url: 'https://example.com/terms',
      kind: 'terms',
      title: 'Terms',
      text: 'short text',   // 10 chars → 1 chunk
      approxTokens: 80,    // overestimated → triggers chunking path
    };
    const req = makeRequest(shortDoc, 100); // threshold = 70, approxTokens = 80 → enters chunking
    const result = await sut.analyze(req);

    expect(result.ok).toBe(true);
    // chunker produces 1 chunk (text is tiny) → no synthesis
    expect(fake.requests.every((r) => !r.isSynthesis)).toBe(true);
  });

  it('returns an error when all chunk analyses fail', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', err(new Error('LLM down')));
    const sut = new ChunkingLlmAnalyzer(fake, chunker);
    const req = makeRequest(makeDoc(80), 100);
    const result = await sut.analyze(req);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.message).toContain('chunk');
  });

  it('uses DEFAULT_MAX_TOKENS when maxTokens is omitted from the request', async () => {
    const fake = new FakeLlmAnalyzer('test', 'model', ok(analysis));
    const sut = new ChunkingLlmAnalyzer(fake, chunker);
    // 60 tokens well under the 6000 default threshold → pass-through
    const doc = makeDoc(60);
    const req: AnalysisRequest = { documents: [doc], language: Language.fromOrDefault('en'), frameworks: LEGAL_FRAMEWORKS };
    const result = await sut.analyze(req);

    expect(result.ok).toBe(true);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]!.isSynthesis).toBeFalsy();
  });

  it('exposes providerLabel and model from the inner analyzer', () => {
    const fake = new FakeLlmAnalyzer('MyProvider', 'my-model', ok(analysis));
    const sut = new ChunkingLlmAnalyzer(fake, chunker);
    expect(sut.providerLabel).toBe('MyProvider');
    expect(sut.model).toBe('my-model');
  });
});
