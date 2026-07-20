import { describe, expect, it } from 'vitest';
import { extractEvidenceFindings } from './community-evidence';
import type { TermsDocument } from '../entities/terms-document';

const documents: TermsDocument[] = [{ url: 'https://x.test/privacy', kind: 'privacy', title: 'Privacy',
  text: 'Before we sell your data after consent.', approxTokens: 9 }];

describe('community evidence', () => {
  it('emits exact offsets only for evidence found in a source document', () => {
    const findings = extractEvidenceFindings(documents, [{ id: 'sale', messageKey: 'flag.sale', affects: ['gdpr'], weight: 80, evidence: 'sell your data' }], []);
    expect(findings[0]?.evidence).toEqual({ documentUrl: documents[0]!.url, quote: 'sell your data', startOffset: 10, endOffset: 24 });
    expect(extractEvidenceFindings(documents, [{ id: 'made-up', messageKey: 'x', affects: [], weight: 1, evidence: 'not there' }], [])).toEqual([]);
  });
});
