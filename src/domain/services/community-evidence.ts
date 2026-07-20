import type { TermsDocument } from '../entities/terms-document';
import type { RedFlag } from '../value-objects/red-flag';
import type { HubKey } from '../ports/hub';

export const ANALYSIS_SCHEMA_VERSION = '3';
export const PROMPT_VERSION = '3';

export function communityKey(documentSetHash: string, language: string): HubKey {
  return { documentSetHash, language, analysisSchemaVersion: ANALYSIS_SCHEMA_VERSION, promptVersion: PROMPT_VERSION };
}

export interface EvidenceFinding {
  readonly id: string;
  readonly kind: 'risk' | 'positive';
  readonly messageKey: string;
  readonly frameworks: readonly string[];
  readonly weight: number;
  readonly evidence: { readonly documentUrl: string; readonly quote: string; readonly startOffset: number; readonly endOffset: number };
}

export function extractEvidenceFindings(documents: readonly TermsDocument[], risks: readonly RedFlag[], positives: readonly string[]): EvidenceFinding[] {
  const candidates = [
    ...risks.map((v) => ({ id: v.id, kind: 'risk' as const, messageKey: v.messageKey, frameworks: v.affects, weight: v.weight, quote: v.evidence })),
    ...positives.map((quote, index) => ({ id: `positive-${index}`, kind: 'positive' as const, messageKey: quote, frameworks: [] as string[], weight: 0, quote })),
  ];
  return candidates.flatMap((candidate) => {
    for (const document of documents) {
      const startOffset = document.text.indexOf(candidate.quote);
      if (startOffset >= 0) return [{ ...candidate, evidence: { documentUrl: document.url, quote: candidate.quote, startOffset, endOffset: startOffset + candidate.quote.length } }];
    }
    return [];
  }).map(({ quote: _quote, ...finding }) => finding);
}
