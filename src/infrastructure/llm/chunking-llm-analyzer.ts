import { type Result, ok, err } from '../../shared/result';
import type { LlmAnalyzer, LlmAnalyzerFactory, LlmAnalysis, AnalysisRequest } from '../../domain/ports/analysis';
import type { TermsDocument } from '../../domain/entities/terms-document';
import type { ProviderId } from '../../domain/value-objects/provider-id';
import { DocumentChunker } from '../../domain/services/document-chunker';

const CHARS_PER_TOKEN = 4;
const CHUNK_FILL_RATIO = 0.7; // chunk if totalTokens > maxTokens × this
const OVERLAP_RATIO = 0.1; // overlap = chunkTokens × this
const DEFAULT_MAX_TOKENS = 6000;

/**
 * Decorator around any LlmAnalyzer that transparently chunks oversized input.
 *
 * If the total approxTokens across all documents in the request exceeds
 * maxTokens × 0.7, the combined text is split into overlapping windows and
 * each window is analysed separately. A final synthesis pass re-feeds the
 * per-chunk results into the same inner analyzer (using isSynthesis:true so
 * the prompt builders switch to synthesis mode).
 */
export class ChunkingLlmAnalyzer implements LlmAnalyzer {
  private readonly chunker: DocumentChunker;

  constructor(
    private readonly inner: LlmAnalyzer,
    chunker?: DocumentChunker,
  ) {
    this.chunker = chunker ?? new DocumentChunker();
  }

  get providerLabel(): string {
    return this.inner.providerLabel;
  }
  get model(): string {
    return this.inner.model;
  }

  async analyze(request: AnalysisRequest): Promise<Result<LlmAnalysis, Error>> {
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const threshold = Math.floor(maxTokens * CHUNK_FILL_RATIO);
    const totalTokens = request.documents.reduce((sum, d) => sum + d.approxTokens, 0);

    if (totalTokens <= threshold) {
      return this.inner.analyze(request);
    }

    const combined = request.documents
      .map((d) => `# ${d.kind.toUpperCase()} — ${d.title}\n\n${d.text}`)
      .join('\n\n---\n\n');

    const chunkTokens = threshold;
    const overlapTokens = Math.max(1, Math.floor(chunkTokens * OVERLAP_RATIO));
    const chunkTexts = this.chunker.chunk(combined, { chunkTokens, overlapTokens });

    const partials: LlmAnalysis[] = [];
    for (let i = 0; i < chunkTexts.length; i++) {
      const text = chunkTexts[i]!;
      const doc: TermsDocument = {
        url: request.documents[0]?.url ?? '',
        kind: 'other',
        title: `Section ${i + 1} of ${chunkTexts.length}`,
        text,
        approxTokens: Math.ceil(text.length / CHARS_PER_TOKEN),
      };
      const chunkReq: AnalysisRequest = { ...request, documents: [doc], isSynthesis: false };
      const result = await this.inner.analyze(chunkReq);
      if (result.ok) partials.push(result.value);
    }

    if (partials.length === 0) {
      return err(new Error('All chunk analyses failed'));
    }
    if (partials.length === 1) {
      return ok(partials[0]!);
    }

    return this.synthesize(partials, request);
  }

  private async synthesize(
    partials: LlmAnalysis[],
    request: AnalysisRequest,
  ): Promise<Result<LlmAnalysis, Error>> {
    const synthText = formatPartials(partials);
    const synthDoc: TermsDocument = {
      url: request.documents[0]?.url ?? '',
      kind: 'other',
      title: 'Synthesis of partial analyses',
      text: synthText,
      approxTokens: Math.ceil(synthText.length / CHARS_PER_TOKEN),
    };
    const synthReq: AnalysisRequest = { ...request, documents: [synthDoc], isSynthesis: true };
    return this.inner.analyze(synthReq);
  }
}

/** Wraps a DefaultLlmAnalyzerFactory so every created analyzer is chunk-aware. */
export class ChunkingLlmAnalyzerFactory implements LlmAnalyzerFactory {
  private readonly chunker = new DocumentChunker();

  constructor(private readonly inner: LlmAnalyzerFactory) {}

  create(provider: ProviderId, secret: string, model?: string): LlmAnalyzer {
    return new ChunkingLlmAnalyzer(this.inner.create(provider, secret, model), this.chunker);
  }
}

function formatPartials(partials: LlmAnalysis[]): string {
  return partials
    .map((p, i) => {
      const fw = p.frameworks
        .map((f) => `  ${f.framework}: ${f.score} — ${f.rationale.slice(0, 80)}`)
        .join('\n');
      const flags = p.redFlags
        .map((f) => `  [${f.id}] weight=${f.weight} — ${f.evidence.slice(0, 80)}`)
        .join('\n');
      const summary = p.summaryLines.map((l) => `  - ${l}`).join('\n');
      return [
        `=== PART ${i + 1} OF ${partials.length} ===`,
        'Framework scores:',
        fw || '  (none)',
        'Red flags:',
        flags || '  (none)',
        'Section summary:',
        summary || '  (none)',
      ].join('\n');
    })
    .join('\n\n');
}
