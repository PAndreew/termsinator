import { type Result, ok, err } from '../shared/result';
import { LEGAL_FRAMEWORKS } from '../domain/value-objects/legal-framework';
import type { Language } from '../domain/value-objects/language';
import { Language as Lang } from '../domain/value-objects/language';
import type { TermsDocument } from '../domain/entities/terms-document';
import type { SiteAssessment } from '../domain/entities/site-assessment';
import type { AnalysisProvenance } from '../domain/entities/risk-assessment';
import type { RedFlag } from '../domain/value-objects/red-flag';
import type { TermsLinkCandidate, TermsFetcher, HtmlSanitizer } from '../domain/ports/content';
import type { LlmAnalyzerFactory, LlmAnalysis } from '../domain/ports/analysis';
import type { ProviderId } from '../domain/value-objects/provider-id';
import type { LanguageDetector } from '../domain/ports/detection';
import type { AssessmentRepository, KeyVault, SettingsRepository } from '../domain/ports/repositories';
import type { Clock, Logger } from '../domain/ports/platform';
import { RedFlagScanner } from '../domain/services/red-flag-scanner';
import { ScoreAggregator } from '../domain/services/score-aggregator';

export interface AnalyzeSiteInput {
  readonly origin: string;
  readonly title: string;
  readonly candidates: readonly TermsLinkCandidate[];
  readonly navigatorLanguages: readonly string[];
  readonly documentLang: string | null;
}

export interface AnalyzeSiteDeps {
  readonly fetcher: TermsFetcher;
  readonly sanitizer: HtmlSanitizer;
  readonly analyzerFactory: LlmAnalyzerFactory;
  readonly keyVault: KeyVault;
  readonly settings: SettingsRepository;
  readonly languageDetector: LanguageDetector;
  readonly repo: AssessmentRepository;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly scanner?: RedFlagScanner;
  readonly aggregator?: ScoreAggregator;
}

/** Max legal pages to fetch per site — keeps it fast and token-light. */
const MAX_DOCUMENTS = 3;

/**
 * The heart of Termsinator: from a set of discovered legal-page links, fetch and
 * sanitise the documents, score them deterministically, optionally enrich with a
 * BYOK LLM, persist and return the verdict. Falls back gracefully to heuristic
 * scoring when no key is available or the LLM call fails.
 */
export class AnalyzeSiteTerms {
  private readonly scanner: RedFlagScanner;
  private readonly aggregator: ScoreAggregator;

  constructor(private readonly deps: AnalyzeSiteDeps) {
    this.scanner = deps.scanner ?? new RedFlagScanner();
    this.aggregator = deps.aggregator ?? new ScoreAggregator();
  }

  async execute(input: AnalyzeSiteInput): Promise<Result<SiteAssessment, Error>> {
    const { fetcher, sanitizer, settings, languageDetector, repo, clock, logger } = this.deps;
    const now = clock.now();
    const cfg = await settings.load();

    const language: Language = cfg.languageOverride
      ? Lang.fromOrDefault(cfg.languageOverride)
      : languageDetector.detect({
          navigatorLanguages: input.navigatorLanguages,
          documentLang: input.documentLang,
        });

    const ranked = [...input.candidates].sort((a, b) => b.score - a.score).slice(0, MAX_DOCUMENTS);
    if (ranked.length === 0) {
      const failed = this.errorAssessment(input, 'no_terms_found', now);
      await repo.save(failed);
      return err(new Error('No terms or privacy documents were found on this site.'));
    }

    // Sanitize each document with a generous budget so the ChunkingLlmAnalyzer
    // sees the full text and can split it into contextual windows itself.
    // We still cap at maxTokens × 5 to avoid unbounded memory on pathological pages.
    const perDocSanitizeLimit = cfg.maxTokens * 5;
    const documents: TermsDocument[] = [];
    for (const candidate of ranked) {
      const fetched = await fetcher.fetch(candidate.url);
      if (!fetched.ok) {
        logger.log('warn', 'fetch failed', { url: candidate.url, error: String(fetched.error) });
        continue;
      }
      const clean = sanitizer.sanitize(fetched.value.html, { maxTokens: perDocSanitizeLimit });
      if (clean.text.length === 0) continue;
      documents.push({
        url: candidate.url,
        kind: candidate.kind,
        title: clean.title || candidate.label,
        text: clean.text,
        approxTokens: clean.approxTokens,
      });
    }

    if (documents.length === 0) {
      const failed = this.errorAssessment(input, 'fetch_failed', now);
      await repo.save(failed);
      return err(new Error('Could not retrieve any legal document content.'));
    }

    const redFlags: RedFlag[] = this.scanAll(documents);
    const { llm, provenance } = await this.maybeAnalyzeWithLlm(
      documents,
      language,
      cfg.activeProvider,
      cfg.maxTokens,
    );

    const assessment = this.aggregator.aggregate({
      redFlags,
      llm,
      frameworks: LEGAL_FRAMEWORKS,
      language,
      provenance,
      now,
    });

    const site: SiteAssessment = {
      origin: input.origin,
      title: input.title,
      status: 'ready',
      documents,
      assessment,
      error: null,
      updatedAt: now,
    };
    await repo.save(site);
    return ok(site);
  }

  private scanAll(documents: readonly TermsDocument[]): RedFlag[] {
    const byId = new Map<string, RedFlag>();
    for (const doc of documents) {
      for (const flag of this.scanner.scan(doc.text)) {
        if (!byId.has(flag.id)) byId.set(flag.id, flag);
      }
    }
    return [...byId.values()];
  }

  private async maybeAnalyzeWithLlm(
    documents: readonly TermsDocument[],
    language: Language,
    preferred: ProviderId | null,
    maxTokens: number,
  ): Promise<{ llm: LlmAnalysis | null; provenance: AnalysisProvenance }> {
    const { keyVault, analyzerFactory, logger } = this.deps;
    const key = await keyVault.active(preferred);
    if (!key) {
      return { llm: null, provenance: { mode: 'heuristic', provider: null, model: null } };
    }
    const analyzer = analyzerFactory.create(key.provider, key.secret);
    const result = await analyzer.analyze({ documents, language, frameworks: LEGAL_FRAMEWORKS, maxTokens });
    if (!result.ok) {
      logger.log('warn', 'llm analysis failed, falling back to heuristics', {
        provider: key.provider,
        error: String(result.error),
      });
      return { llm: null, provenance: { mode: 'heuristic', provider: null, model: null } };
    }
    return {
      llm: result.value,
      provenance: { mode: 'llm', provider: key.provider, model: analyzer.model },
    };
  }

  private errorAssessment(input: AnalyzeSiteInput, code: string, now: number): SiteAssessment {
    return {
      origin: input.origin,
      title: input.title,
      status: 'error',
      documents: [],
      assessment: null,
      error: code,
      updatedAt: now,
    };
  }
}
