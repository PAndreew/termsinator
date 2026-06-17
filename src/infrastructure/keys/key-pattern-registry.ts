import type { ProviderId } from '../../domain/value-objects/provider-id';

/**
 * The factory data behind credential detection: for each provider, the dashboard
 * hosts where its keys legitimately appear and the regex that recognises one.
 *
 * Host-scoping is what makes the bare `sk-` providers (OpenAI/DeepSeek/Moonshot)
 * unambiguous — we only run a provider's regex on its own dashboard, so a key is
 * always attributed to the site the user is actually logged into.
 */
export interface ProviderPattern {
  readonly provider: ProviderId;
  readonly hosts: readonly string[];
  readonly key: RegExp;
}

export const PROVIDER_PATTERNS: readonly ProviderPattern[] = [
  { provider: 'anthropic', hosts: ['console.anthropic.com'], key: /sk-ant-(?:api\d{2}-)?[A-Za-z0-9_-]{24,}/ },
  { provider: 'openrouter', hosts: ['openrouter.ai'], key: /sk-or-(?:v1-)?[A-Za-z0-9_-]{24,}/ },
  { provider: 'openai', hosts: ['platform.openai.com'], key: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { provider: 'deepseek', hosts: ['platform.deepseek.com'], key: /sk-[A-Za-z0-9]{20,}/ },
  { provider: 'moonshot', hosts: ['platform.moonshot.cn', 'platform.moonshot.ai'], key: /sk-[A-Za-z0-9]{20,}/ },
  { provider: 'google', hosts: ['aistudio.google.com', 'makersuite.google.com'], key: /AIza[0-9A-Za-z_-]{35}/ },
  { provider: 'xai', hosts: ['console.x.ai'], key: /xai-[A-Za-z0-9]{20,}/ },
  { provider: 'groq', hosts: ['console.groq.com'], key: /gsk_[A-Za-z0-9]{20,}/ },
  { provider: 'perplexity', hosts: ['perplexity.ai', 'www.perplexity.ai'], key: /pplx-[A-Za-z0-9]{20,}/ },
  { provider: 'fireworks', hosts: ['fireworks.ai', 'app.fireworks.ai'], key: /fw_[A-Za-z0-9]{20,}/ },
  { provider: 'zhipu', hosts: ['open.bigmodel.cn', 'z.ai', 'bigmodel.cn'], key: /[0-9a-f]{32}\.[A-Za-z0-9]{16,}/ },
  { provider: 'mistral', hosts: ['console.mistral.ai', 'admin.mistral.ai'], key: /\b[A-Za-z0-9]{32}\b/ },
];

/** Hosts where a Google service-account / Vertex auth JSON may legitimately appear. */
export const AUTH_JSON_HOSTS: readonly string[] = [
  'console.cloud.google.com',
  'aistudio.google.com',
];

function hostMatches(host: string, registered: string): boolean {
  return host === registered || host.endsWith(`.${registered}`);
}

/** Patterns whose host list covers the given page host. */
export function patternsForHost(host: string): readonly ProviderPattern[] {
  const h = host.toLowerCase();
  return PROVIDER_PATTERNS.filter((p) => p.hosts.some((rh) => hostMatches(h, rh)));
}

export function isAuthJsonHost(host: string): boolean {
  const h = host.toLowerCase();
  return AUTH_JSON_HOSTS.some((rh) => hostMatches(h, rh));
}
