import { type Result, ok, err } from '../shared/result';
import type { Language } from '../domain/value-objects/language';
import { Language as Lang } from '../domain/value-objects/language';
import type { TermsDocument } from '../domain/entities/terms-document';
import type { SiteAssessment } from '../domain/entities/site-assessment';
import type { RiskAssessment, AnalysisProvenance } from '../domain/entities/risk-assessment';
import type { RedFlag } from '../domain/value-objects/red-flag';
import type { AnchorLike, TermsLinkCandidate, TermsLinkDiscoverer, TermsFetcher, HtmlSanitizer } from '../domain/ports/content';
import type { AnalysisRequest, LlmAnalyzerFactory, LlmAnalysis } from '../domain/ports/analysis';
import type { HubClient } from '../domain/ports/hub';
import type { ProviderId } from '../domain/value-objects/provider-id';
import type { LanguageDetector } from '../domain/ports/detection';
import type { AssessmentRepository, KeyVault, SettingsRepository } from '../domain/ports/repositories';
import type { Clock, Logger } from '../domain/ports/platform';
import { RedFlagScanner } from '../domain/services/red-flag-scanner';
import { ScoreAggregator } from '../domain/services/score-aggregator';
import { contentHash } from '../domain/services/content-hash';
import { communityKey } from '../domain/services/community-evidence';

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
  /** Optional: community hub client. Omitting it disables hub integration. */
  readonly hubClient?: HubClient;
  /** Optional: used to run heuristic discovery on background-fetched anchors. */
  readonly discoverer?: TermsLinkDiscoverer;
}

/** Max legal pages to fetch per site — keeps it fast and token-light. */
const MAX_DOCUMENTS = 3;

/**
 * The heart of Termsinator: from a set of discovered legal-page links, fetch and
 * sanitise the documents, score them deterministically, optionally enrich with a
 * BYOK LLM, persist and return the verdict. Falls back gracefully to heuristic
 * scoring when no key is available or the LLM call fails.
 *
 * When a hubClient is injected and the user has opted in (shareAnalyses=true,
 * hubUrl set), the use case:
 *   1. Computes a SHA-256 hash of the sanitised document content.
 *   2. Checks the hub for a fresh cached analysis before calling the LLM.
 *   3. Submits the local result to the hub after a successful local analysis.
 */
export class AnalyzeSiteTerms {
  private readonly scanner: RedFlagScanner;
  private readonly aggregator: ScoreAggregator;

  constructor(private readonly deps: AnalyzeSiteDeps) {
    this.scanner = deps.scanner ?? new RedFlagScanner();
    this.aggregator = deps.aggregator ?? new ScoreAggregator();
  }

  async execute(input: AnalyzeSiteInput): Promise<Result<SiteAssessment, Error>> {
    const { fetcher, sanitizer, settings, languageDetector, repo, clock, logger, hubClient } =
      this.deps;
    const now = clock.now();
    const cfg = await settings.load();

    const language: Language = cfg.languageOverride
      ? Lang.fromOrDefault(cfg.languageOverride)
      : languageDetector.detect({
          navigatorLanguages: input.navigatorLanguages,
          documentLang: input.documentLang,
        });

    let candidates: readonly TermsLinkCandidate[] = input.candidates;
    if (candidates.length === 0 && this.deps.discoverer) {
      candidates = await this.backgroundDiscover(
        input.origin,
        language,
        cfg.activeProvider,
        cfg.modelOverride ?? undefined,
      );
    }

    const ranked = [...candidates].sort((a, b) => b.score - a.score).slice(0, MAX_DOCUMENTS);
    if (ranked.length === 0) {
      const failed = this.errorAssessment(input, 'no_terms_found', now);
      await repo.save(failed);
      return err(new Error('No terms or privacy documents were found on this site.'));
    }

    // Sanitize each document with a generous budget so the ChunkingLlmAnalyzer
    // sees the full text and can split it into contextual windows itself.
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

    const policyUrls = documents.map((d) => d.url);

    // Always compute the hash — used for both local and hub cache hits.
    const termsHash = await contentHash(documents.map((d) => d.text));

    // --- Local cache check ---
    if (!cfg.alwaysRefresh) {
      const existing = await repo.get(input.origin);
      if (existing?.status === 'ready' && existing.termsHash === termsHash && matchesRequestedEngine(existing.assessment, cfg.activeProvider, cfg.modelOverride)) {
        logger.log('info', 'local cache hit (terms unchanged)', { origin: input.origin });
        return ok(existing);
      }
    }

    // --- Local analysis ---
    const redFlags: RedFlag[] = this.scanAll(documents);
    const { llm, provenance } = await this.maybeAnalyzeWithLlm(
      documents,
      language,
      cfg.activeProvider,
      cfg.maxTokens,
      cfg.modelOverride ?? undefined,
    );

    const assessment = this.aggregator.aggregate({
      redFlags,
      llm,
      documents,
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
      termsHash,
      policyUrls,
    };
    await repo.save(site);

    // --- Hub submission (opt-in, best-effort) ---
    if (hubClient && cfg.shareAnalyses && assessment) {
      await hubClient.submit(input.origin, communityKey(termsHash, language.tag), assessment, documents);
    }

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
    modelOverride?: string,
  ): Promise<{ llm: LlmAnalysis | null; provenance: AnalysisProvenance }> {
    const { keyVault, analyzerFactory, logger } = this.deps;
    const key = await keyVault.active(preferred);
    if (!key) {
      return { llm: null, provenance: { mode: 'heuristic', provider: null, model: null } };
    }
    const analyzer = analyzerFactory.create(key.provider, key.secret, modelOverride);
    const result = await analyzer.analyze({ documents, language, maxTokens });
    if (!result.ok) {
      logger.log('warn', 'llm analysis failed, falling back to heuristics', {
        provider: key.provider,
        error: String(result.error),
      });
      return { llm: null, provenance: { mode: 'heuristic', provider: null, model: null } };
    }
    return {
      llm: result.value.kind === 'policy_analysis' ? result.value : null,
      provenance: { mode: 'llm', provider: key.provider, model: analyzer.model },
    };
  }

  private async backgroundDiscover(
    origin: string,
    language: Language,
    preferred: ProviderId | null,
    modelOverride?: string,
  ): Promise<readonly TermsLinkCandidate[]> {
    const { fetcher, discoverer, analyzerFactory, keyVault, logger } = this.deps;
    if (!discoverer) return [];

    // Tier 1: fetch root page, extract anchors via regex, run keyword matcher
    const rootResult = await fetcher.fetch(origin + '/');
    if (rootResult.ok) {
      const anchors = extractAnchorsFromHtml(rootResult.value.html);
      const found = discoverer.discover(anchors, origin);
      if (found.length > 0) {
        logger.log('info', 'discovered via root page', { origin, count: found.length });
        return found;
      }
    }

    // Tier 2: fetch sitemap.xml, keyword-match on URL paths
    const sitemapResult = await fetcher.fetch(origin + '/sitemap.xml');
    if (sitemapResult.ok) {
      const sitemapAnchors = extractSitemapAnchors(sitemapResult.value.html);
      const found = discoverer.discover(sitemapAnchors, origin);
      if (found.length > 0) {
        logger.log('info', 'discovered via sitemap heuristic', { origin, count: found.length });
        return found;
      }

      // Tier 3: LLM picks from the sitemap URL list
      const key = await keyVault.active(preferred);
      if (key && sitemapAnchors.length > 0) {
        const urlList = sitemapAnchors
          .map((a) => a.href)
          .filter((u) => u.length > 0)
          .slice(0, 300)
          .join('\n');
        const req: AnalysisRequest = {
          documents: [
            {
              url: origin,
              kind: 'other',
              title: 'URL List',
              text: urlList,
              approxTokens: Math.ceil(urlList.length / 4),
            },
          ],
          language,
          isUrlDiscovery: true,
        };
        const analyzer = analyzerFactory.create(key.provider, key.secret, modelOverride);
        const result = await analyzer.analyze(req);
        if (result.ok && result.value.kind === 'url_discovery') {
          const { terms, privacy } = result.value.discoveredUrls;
          const llmFound: TermsLinkCandidate[] = [];
          if (terms) llmFound.push({ url: terms, kind: 'terms', label: 'Terms of Use', score: 0.8 });
          if (privacy) llmFound.push({ url: privacy, kind: 'privacy', label: 'Privacy Policy', score: 0.8 });
          if (llmFound.length > 0) {
            logger.log('info', 'discovered via LLM', { origin, count: llmFound.length });
            return llmFound;
          }
        }
      }
    }

    return [];
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
      termsHash: null,
      policyUrls: [],
    };
  }
}

function matchesRequestedEngine(assessment: RiskAssessment | null, provider: ProviderId | null, model: string | null): boolean {
  if (!assessment || assessment.provenance.mode === 'hub') return false;
  if (assessment.provenance.mode !== 'llm') return provider === null && model === null;
  if (provider !== null && assessment.provenance.provider !== provider) return false;
  if (model !== null && assessment.provenance.model !== model) return false;
  return true;
}

/** Extracts anchor-like objects from raw HTML using regex (no DOM required). */
function extractAnchorsFromHtml(html: string): AnchorLike[] {
  const re = /<a\b[^>]*?href=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/a>/gi;
  const results: AnchorLike[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && results.length < 600) {
    results.push({
      href: m[1] ?? '',
      text: (m[2] ?? '').replace(/<[^>]+>/g, ' ').trim().slice(0, 120),
    });
  }
  return results;
}

/** Extracts URLs from a sitemap XML as anchor-like objects for heuristic matching. */
function extractSitemapAnchors(xml: string): AnchorLike[] {
  const re = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/g;
  const results: AnchorLike[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && results.length < 1000) {
    const url = m[1]!.trim();
    results.push({ href: url, text: url });
  }
  return results;
}
