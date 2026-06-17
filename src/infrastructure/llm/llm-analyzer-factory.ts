import type { ProviderId } from '../../domain/value-objects/provider-id';
import type { LlmAnalyzer, LlmAnalyzerFactory } from '../../domain/ports/analysis';
import type { FetchLike } from './http';
import { OpenAiCompatibleAnalyzer } from './openai-compatible-analyzer';
import { AnthropicAnalyzer } from './anthropic-analyzer';
import { GoogleAnalyzer } from './google-analyzer';

/** Base URL + default model for each OpenAI-dialect provider. */
const OPENAI_DIALECT: Partial<Record<ProviderId, { baseUrl: string; model: string; label: string }>> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', label: 'OpenAI' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', label: 'DeepSeek' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k', label: 'Moonshot (Kimi)' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', label: 'Groq' },
  xai: { baseUrl: 'https://api.x.ai/v1', model: 'grok-2-latest', label: 'xAI (Grok)' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', label: 'Mistral AI' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', label: 'OpenRouter' },
  perplexity: { baseUrl: 'https://api.perplexity.ai', model: 'sonar', label: 'Perplexity' },
  fireworks: {
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
    label: 'Fireworks AI',
  },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', label: 'Zhipu / Z.ai (GLM)' },
};

const DEFAULT_MODEL: Record<'anthropic' | 'google', string> = {
  anthropic: 'claude-3-5-haiku-latest',
  google: 'gemini-1.5-flash',
};

/**
 * The composition seam for analysis: given a provider + secret it returns the
 * correct Liskov-substitutable LlmAnalyzer. All vendor knowledge (endpoints,
 * default models, auth quirks) is centralised here; callers stay vendor-blind.
 */
export class DefaultLlmAnalyzerFactory implements LlmAnalyzerFactory {
  constructor(private readonly fetchImpl: FetchLike) {}

  create(provider: ProviderId, secret: string, model?: string): LlmAnalyzer {
    if (provider === 'anthropic') {
      return new AnthropicAnalyzer({
        apiKey: secret,
        model: model ?? DEFAULT_MODEL.anthropic,
        fetchImpl: this.fetchImpl,
      });
    }
    if (provider === 'google') {
      return new GoogleAnalyzer({
        apiKey: secret,
        model: model ?? DEFAULT_MODEL.google,
        fetchImpl: this.fetchImpl,
      });
    }
    const dialect = OPENAI_DIALECT[provider];
    if (!dialect) {
      // Should be unreachable: every ProviderId is covered above or here.
      throw new Error(`No analyzer configured for provider "${provider}"`);
    }
    return new OpenAiCompatibleAnalyzer({
      providerLabel: dialect.label,
      baseUrl: dialect.baseUrl,
      apiKey: secret,
      model: model ?? dialect.model,
      fetchImpl: this.fetchImpl,
    });
  }
}
