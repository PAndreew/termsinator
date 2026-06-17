/**
 * The set of AI providers Termsinator can recognise a BYOK credential for.
 * This is a domain concept (which providers exist); the concrete host names and
 * key regexes live in the infrastructure layer (KeyPatternRegistry).
 */
export const PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'groq',
  'openrouter',
  'deepseek',
  'moonshot',
  'mistral',
  'zhipu',
  'perplexity',
  'fireworks',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

const DISPLAY_NAMES: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  xai: 'xAI (Grok)',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot (Kimi)',
  mistral: 'Mistral AI',
  zhipu: 'Zhipu / Z.ai (GLM)',
  perplexity: 'Perplexity',
  fireworks: 'Fireworks AI',
};

/** Region tag, useful for surfacing jurisdiction hints in the UI. */
export const PROVIDER_REGION: Record<ProviderId, 'us' | 'eu' | 'cn'> = {
  openai: 'us',
  anthropic: 'us',
  google: 'us',
  xai: 'us',
  groq: 'us',
  openrouter: 'us',
  perplexity: 'us',
  fireworks: 'us',
  mistral: 'eu',
  deepseek: 'cn',
  moonshot: 'cn',
  zhipu: 'cn',
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function providerDisplayName(id: ProviderId): string {
  return DISPLAY_NAMES[id];
}
