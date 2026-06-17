import { type Result, err } from '../../shared/result';
import type { AnalysisRequest, LlmAnalysis, LlmAnalyzer } from '../../domain/ports/analysis';
import { buildSystemPrompt, buildUserPrompt, parseAnalysis } from './prompt';
import { type FetchLike, postJson, dig } from './http';

export interface OpenAiCompatibleConfig {
  readonly providerLabel: string;
  readonly baseUrl: string; // e.g. https://api.openai.com/v1
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl: FetchLike;
}

/**
 * Adapter for every backend that speaks the OpenAI Chat Completions dialect:
 * OpenAI itself plus DeepSeek, Moonshot, Groq, xAI, Mistral and OpenRouter —
 * they differ only in base URL and model id. One class, many providers, all
 * Liskov-substitutable behind LlmAnalyzer.
 */
export class OpenAiCompatibleAnalyzer implements LlmAnalyzer {
  constructor(private readonly cfg: OpenAiCompatibleConfig) {}

  get providerLabel(): string {
    return this.cfg.providerLabel;
  }

  get model(): string {
    return this.cfg.model;
  }

  async analyze(request: AnalysisRequest): Promise<Result<LlmAnalysis, Error>> {
    const res = await postJson(
      this.cfg.fetchImpl,
      `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`,
      { authorization: `Bearer ${this.cfg.apiKey}` },
      {
        model: this.cfg.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(request) },
          { role: 'user', content: buildUserPrompt(request) },
        ],
      },
    );
    if (!res.ok) return res;

    const content = dig(res.value, 'choices', 0, 'message', 'content');
    if (typeof content !== 'string') {
      return err(new Error('Unexpected chat-completions response shape'));
    }
    return parseAnalysis(content);
  }
}
