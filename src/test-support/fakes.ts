/**
 * In-memory, Liskov-substitutable fakes for every port. These let the
 * application layer be tested without a browser, network or real LLM — and they
 * double as living proof that the port abstractions are honoured.
 */
import { type Result, ok, err } from '../shared/result';
import type { SiteAssessment } from '../domain/entities/site-assessment';
import { type Settings, DEFAULT_SETTINGS } from '../domain/entities/settings';
import type { ProviderKey } from '../domain/entities/provider-key';
import type { ProviderId } from '../domain/value-objects/provider-id';
import { Language } from '../domain/value-objects/language';
import type {
  AssessmentRepository,
  KeyVault,
  SettingsRepository,
} from '../domain/ports/repositories';
import type { RawDocument, TermsFetcher, HtmlSanitizer, SanitizedContent } from '../domain/ports/content';
import type { LanguageDetector } from '../domain/ports/detection';
import type {
  AnalysisRequest,
  LlmAnalysis,
  LlmAnalyzer,
  LlmAnalyzerFactory,
} from '../domain/ports/analysis';
import type { Clock, Logger, Notifier, ToastRequest } from '../domain/ports/platform';

export class InMemoryAssessmentRepository implements AssessmentRepository {
  readonly store = new Map<string, SiteAssessment>();
  async get(origin: string): Promise<SiteAssessment | null> {
    return this.store.get(origin) ?? null;
  }
  async save(assessment: SiteAssessment): Promise<void> {
    this.store.set(assessment.origin, assessment);
  }
  async remove(origin: string): Promise<void> {
    this.store.delete(origin);
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  constructor(public current: Settings = DEFAULT_SETTINGS) {}
  async load(): Promise<Settings> {
    return this.current;
  }
  async save(settings: Settings): Promise<void> {
    this.current = settings;
  }
}

export class InMemoryKeyVault implements KeyVault {
  readonly keys: ProviderKey[] = [];
  async list(): Promise<readonly ProviderKey[]> {
    return [...this.keys];
  }
  async add(key: ProviderKey): Promise<void> {
    if (!this.keys.some((k) => k.id === key.id)) this.keys.push(key);
  }
  async remove(id: string): Promise<void> {
    const i = this.keys.findIndex((k) => k.id === id);
    if (i >= 0) this.keys.splice(i, 1);
  }
  async active(preferred: ProviderId | null): Promise<ProviderKey | null> {
    if (preferred) return this.keys.find((k) => k.provider === preferred) ?? this.keys[0] ?? null;
    return this.keys[0] ?? null;
  }
}

export class FakeFetcher implements TermsFetcher {
  readonly responses = new Map<string, Result<RawDocument, Error>>();
  setHtml(url: string, html: string, contentType = 'text/html'): void {
    this.responses.set(url, ok({ url, finalUrl: url, html, contentType }));
  }
  setError(url: string, message: string): void {
    this.responses.set(url, err(new Error(message)));
  }
  async fetch(url: string): Promise<Result<RawDocument, Error>> {
    return this.responses.get(url) ?? err(new Error(`no stub for ${url}`));
  }
}

/** Trivial sanitizer fake: keeps text, estimates tokens at ~4 chars/token. */
export class PassthroughSanitizer implements HtmlSanitizer {
  sanitize(html: string): SanitizedContent {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { title: 'Document', text, approxTokens: Math.ceil(text.length / 4), truncated: false };
  }
}

export class FixedLanguageDetector implements LanguageDetector {
  constructor(private readonly lang: Language = Language.english()) {}
  detect(): Language {
    return this.lang;
  }
}

export class FakeLlmAnalyzer implements LlmAnalyzer {
  public lastRequest: AnalysisRequest | null = null;
  public readonly requests: AnalysisRequest[] = [];
  constructor(
    public readonly providerLabel: string,
    public readonly model: string,
    private readonly result: Result<LlmAnalysis, Error>,
  ) {}
  async analyze(request: AnalysisRequest): Promise<Result<LlmAnalysis, Error>> {
    this.lastRequest = request;
    this.requests.push(request);
    return this.result;
  }
}

export class FakeLlmAnalyzerFactory implements LlmAnalyzerFactory {
  public created: { provider: ProviderId; secret: string }[] = [];
  constructor(private readonly analyzer: FakeLlmAnalyzer) {}
  create(provider: ProviderId, secret: string): LlmAnalyzer {
    this.created.push({ provider, secret });
    return this.analyzer;
  }
}

export class FixedClock implements Clock {
  constructor(private value = 1_000) {}
  now(): number {
    return this.value;
  }
  set(value: number): void {
    this.value = value;
  }
}

export class NullLogger implements Logger {
  readonly entries: { level: string; message: string }[] = [];
  log(level: string, message: string): void {
    this.entries.push({ level, message });
  }
}

export class RecordingNotifier implements Notifier {
  readonly toasts: ToastRequest[] = [];
  async toast(request: ToastRequest): Promise<void> {
    this.toasts.push(request);
  }
}
