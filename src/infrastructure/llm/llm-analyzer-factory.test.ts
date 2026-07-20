import { describe, it, expect } from 'vitest';
import { DefaultLlmAnalyzerFactory } from './llm-analyzer-factory';
import type { FetchLike } from './http';
import { Language } from '../../domain/value-objects/language';
import { PROVIDER_IDS } from '../../domain/value-objects/provider-id';
import type { AnalysisRequest } from '../../domain/ports/analysis';
import { policyModel } from '../../test-support/policy-fixtures';

const ANALYSIS_JSON = JSON.stringify(policyModel());

interface Call {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
}

/** Builds a fake fetch that records calls and returns a provider-shaped body. */
function fakeFetch(bodyFor: (url: string) => unknown, status = 200): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const body = bodyFor(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  };
  return { fetch, calls };
}

const request: AnalysisRequest = {
  documents: [{ url: 'https://x/p', kind: 'privacy', title: 'P', text: 'terms', approxTokens: 1 }],
  language: Language.english(),
};

describe('DefaultLlmAnalyzerFactory', () => {
  it('builds an OpenAI-dialect call for OpenAI-family providers', async () => {
    const { fetch, calls } = fakeFetch(() => ({ choices: [{ message: { content: ANALYSIS_JSON } }] }));
    const analyzer = new DefaultLlmAnalyzerFactory(fetch).create('deepseek', 'secret123');
    const r = await analyzer.analyze(request);

    expect(r.ok).toBe(true);
    expect(calls[0]!.url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(calls[0]!.init.headers.authorization).toBe('Bearer secret123');
    const body = JSON.parse(calls[0]!.init.body);
    expect(body.model).toBe('deepseek-chat');
    expect(body.messages).toHaveLength(2);
  });

  it('builds an Anthropic Messages call with the browser-access header', async () => {
    const { fetch, calls } = fakeFetch(() => ({ content: [{ type: 'text', text: ANALYSIS_JSON }] }));
    const analyzer = new DefaultLlmAnalyzerFactory(fetch).create('anthropic', 'sk-ant-xyz');
    const r = await analyzer.analyze(request);

    expect(r.ok).toBe(true);
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]!.init.headers['x-api-key']).toBe('sk-ant-xyz');
    expect(calls[0]!.init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('builds a Gemini generateContent call with the key in the query', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      candidates: [{ content: { parts: [{ text: ANALYSIS_JSON }] } }],
    }));
    const analyzer = new DefaultLlmAnalyzerFactory(fetch).create('google', 'AIzaKEY');
    const r = await analyzer.analyze(request);

    expect(r.ok).toBe(true);
    expect(calls[0]!.url).toContain(':generateContent?key=AIzaKEY');
  });

  it('surfaces HTTP errors as a failed Result', async () => {
    const { fetch } = fakeFetch(() => ({ error: 'nope' }), 401);
    const analyzer = new DefaultLlmAnalyzerFactory(fetch).create('openai', 'bad');
    const r = await analyzer.analyze(request);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('401');
  });

  it('can construct an analyzer for every known provider', () => {
    const { fetch } = fakeFetch(() => ({}));
    const factory = new DefaultLlmAnalyzerFactory(fetch);
    for (const provider of PROVIDER_IDS) {
      const analyzer = factory.create(provider, 'secret');
      expect(analyzer.model.length).toBeGreaterThan(0);
      expect(analyzer.providerLabel.length).toBeGreaterThan(0);
    }
  });
});
