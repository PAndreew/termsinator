import type { Result } from '../../shared/result';
import type { TermsDocumentKind } from '../entities/terms-document';

/** Minimal anchor shape so discovery is testable without a real DOM. */
export interface AnchorLike {
  readonly href: string;
  readonly text: string;
  readonly rel?: string;
}

export interface TermsLinkCandidate {
  readonly url: string;
  readonly kind: TermsDocumentKind;
  readonly label: string;
  /** Confidence 0..1 used to rank/limit how many pages we fetch. */
  readonly score: number;
}

/** Finds Terms/Privacy/Cookie links from a page's anchors (multilingual). */
export interface TermsLinkDiscoverer {
  discover(anchors: readonly AnchorLike[], baseUrl: string): readonly TermsLinkCandidate[];
}

export interface SanitizeOptions {
  readonly maxTokens?: number;
}

export interface SanitizedContent {
  readonly title: string;
  readonly text: string;
  readonly approxTokens: number;
  readonly truncated: boolean;
}

/** Strips markup/boilerplate to a token-efficient plain-text core. */
export interface HtmlSanitizer {
  sanitize(html: string, options?: SanitizeOptions): SanitizedContent;
}

export interface RawDocument {
  readonly url: string;
  readonly finalUrl: string;
  readonly html: string;
  readonly contentType: string;
}

/** Fetches a remote legal page (runs in the background service worker). */
export interface TermsFetcher {
  fetch(url: string): Promise<Result<RawDocument, Error>>;
}
