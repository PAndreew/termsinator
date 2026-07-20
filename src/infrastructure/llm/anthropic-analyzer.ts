import { type Result, err } from '../../shared/result';
import type { AnalysisRequest, LlmAnalysis, LlmAnalyzer } from '../../domain/ports/analysis';
import { buildSystemPrompt, buildUserPrompt, parseAnalysis } from './prompt';
import { type FetchLike, postJson, dig } from './http';

export interface AnthropicConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl: FetchLike;
  readonly baseUrl?: string;
}

/**
 * Anthropic Messages API adapter. Note the dangerous-direct-browser-access
 * header: Anthropic blocks browser-origin calls by default, and an MV3 extension
 * is a browser origin, so BYOK direct calls require opting in.
 */
export class AnthropicAnalyzer implements LlmAnalyzer {
  readonly providerLabel = 'Anthropic';
  constructor(private readonly cfg: AnthropicConfig) {}

  get model(): string {
    return this.cfg.model;
  }

  async analyze(request: AnalysisRequest): Promise<Result<LlmAnalysis, Error>> {
    const base = (this.cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    const res = await postJson(
      this.cfg.fetchImpl,
      `${base}/v1/messages`,
      {
        'x-api-key': this.cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      {
        model: this.cfg.model,
        max_tokens: 8192,
        temperature: 0.2,
        system: buildSystemPrompt(request),
        messages: [{ role: 'user', content: buildUserPrompt(request) }],
      },
    );
    if (!res.ok) return res;

    const text = dig(res.value, 'content', 0, 'text');
    if (typeof text !== 'string') {
      return err(new Error('Unexpected Anthropic messages response shape'));
    }
    return parseAnalysis(text, request);
  }
}
