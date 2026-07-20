import { type Result, err } from '../../shared/result';
import type { LlmAnalyzer, LlmAnalyzerFactory, LlmAnalysis, AnalysisRequest } from '../../domain/ports/analysis';
import type { TermsDocument } from '../../domain/entities/terms-document';
import type { ProviderId } from '../../domain/value-objects/provider-id';
import type { VerifiedPolicyModelAnalysis } from '../../domain/entities/policy-analysis';
import { DocumentChunker } from '../../domain/services/document-chunker';

const CHARS_PER_TOKEN = 4;
const CHUNK_FILL_RATIO = 0.7;
const OVERLAP_RATIO = 0.1;
const DEFAULT_MAX_TOKENS = 6000;

/** Extracts verified evidence per chunk, then asks the model to classify once. */
export class ChunkingLlmAnalyzer implements LlmAnalyzer {
  private readonly chunker: DocumentChunker;

  constructor(private readonly inner: LlmAnalyzer, chunker?: DocumentChunker) {
    this.chunker = chunker ?? new DocumentChunker();
  }

  get providerLabel(): string { return this.inner.providerLabel; }
  get model(): string { return this.inner.model; }

  async analyze(request: AnalysisRequest): Promise<Result<LlmAnalysis, Error>> {
    if (request.isUrlDiscovery || request.isSynthesis) return this.inner.analyze(request);
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const threshold = Math.floor(maxTokens * CHUNK_FILL_RATIO);
    const totalTokens = request.documents.reduce((sum, document) => sum + document.approxTokens, 0);
    if (totalTokens <= threshold) return this.inner.analyze(request);

    const partials: VerifiedPolicyModelAnalysis[] = [];
    for (const source of request.documents) {
      const overlapTokens = Math.max(1, Math.floor(threshold * OVERLAP_RATIO));
      const chunks = this.chunker.chunk(source.text, { chunkTokens: threshold, overlapTokens });
      for (let index = 0; index < chunks.length; index++) {
        const text = chunks[index]!;
        const document: TermsDocument = {
          ...source,
          title: `${source.title} (${index + 1}/${chunks.length})`,
          text,
          approxTokens: Math.ceil(text.length / CHARS_PER_TOKEN),
        };
        const result = await this.inner.analyze({ ...request, documents: [document] });
        if (result.ok && result.value.kind === 'policy_analysis') partials.push(result.value);
      }
    }
    if (partials.length === 0) return err(new Error('All chunk analyses failed'));

    const synthesisDocument: TermsDocument = {
      url: request.documents[0]?.url ?? 'https://invalid.local/',
      kind: 'other',
      title: 'Verified evidence candidates',
      text: JSON.stringify(partials),
      approxTokens: Math.ceil(JSON.stringify(partials).length / CHARS_PER_TOKEN),
    };
    return this.inner.analyze({
      ...request,
      documents: [synthesisDocument],
      sourceDocuments: request.documents,
      isSynthesis: true,
    });
  }
}

export class ChunkingLlmAnalyzerFactory implements LlmAnalyzerFactory {
  private readonly chunker = new DocumentChunker();
  constructor(private readonly inner: LlmAnalyzerFactory) {}
  create(provider: ProviderId, secret: string, model?: string): LlmAnalyzer {
    return new ChunkingLlmAnalyzer(this.inner.create(provider, secret, model), this.chunker);
  }
}
