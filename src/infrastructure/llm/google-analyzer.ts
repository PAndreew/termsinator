import { type Result, err } from '../../shared/result';
import type { AnalysisRequest, LlmAnalysis, LlmAnalyzer } from '../../domain/ports/analysis';
import { buildSystemPrompt, buildUserPrompt, parseAnalysis } from './prompt';
import { type FetchLike, postJson, dig } from './http';

export interface GoogleConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl: FetchLike;
  readonly baseUrl?: string;
}

/** Google Gemini (generativelanguage) adapter. API key goes in the query string. */
export class GoogleAnalyzer implements LlmAnalyzer {
  readonly providerLabel = 'Google Gemini';
  constructor(private readonly cfg: GoogleConfig) {}

  get model(): string {
    return this.cfg.model;
  }

  async analyze(request: AnalysisRequest): Promise<Result<LlmAnalysis, Error>> {
    const base = (this.cfg.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const url = `${base}/v1beta/models/${this.cfg.model}:generateContent?key=${encodeURIComponent(this.cfg.apiKey)}`;
    const res = await postJson(this.cfg.fetchImpl, url, {}, {
      systemInstruction: { parts: [{ text: buildSystemPrompt(request) }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(request) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    });
    if (!res.ok) return res;

    const text = dig(res.value, 'candidates', 0, 'content', 'parts', 0, 'text');
    if (typeof text !== 'string') {
      return err(new Error('Unexpected Gemini generateContent response shape'));
    }
    return parseAnalysis(text);
  }
}
