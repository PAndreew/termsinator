import { describe, expect, it } from 'vitest';
import { parseAnalysis, buildSystemPrompt, buildUserPrompt } from './prompt';
import { Language } from '../../domain/value-objects/language';
import type { AnalysisRequest } from '../../domain/ports/analysis';
import { policyModel } from '../../test-support/policy-fixtures';

const request: AnalysisRequest = {
  documents: [{ url: 'https://x.test/p', kind: 'privacy', title: 'P', text: 'some policy terms', approxTokens: 3 }],
  language: Language.fromOrDefault('de'),
};

describe('analysis prompt v3', () => {
  it('omits scoring instructions and includes the complete attribute catalog', () => {
    const system = buildSystemPrompt(request);
    expect(system).toContain('Mode: full');
    expect(system).toContain('data.basic_identifiers');
    expect(system).toContain('transparency.accountability_contact');
    expect(system).toContain('do not calculate scores');
    expect(system).not.toContain('"weight"');
  });

  it('labels source documents for exact evidence references', () => {
    const user = buildUserPrompt(request);
    expect(user).toContain('"documentId":"doc-1"');
    expect(user).toContain('some policy terms');
  });

  it('accepts a strict schema-v3 response and rejects surrounding prose', () => {
    const valid = JSON.stringify(policyModel({ language: 'de' }));
    const parsed = parseAnalysis(valid, request);
    expect(parsed.ok && parsed.value.kind).toBe('policy_analysis');
    expect(parseAnalysis(`Here is the result: ${valid}`, request).ok).toBe(false);
  });

  it('parses URL discovery independently from policy analysis', () => {
    const discoveryRequest = {
      ...request,
      documents: [{ ...request.documents[0]!, text: 'https://x.test/terms\nhttps://x.test/privacy' }],
      isUrlDiscovery: true,
    };
    const parsed = parseAnalysis('{"terms":"https://x.test/terms","privacy":null}', discoveryRequest);
    expect(parsed.ok && parsed.value.kind === 'url_discovery' && parsed.value.discoveredUrls.terms).toBe('https://x.test/terms');
  });
});
