import type { TermsDocumentKind } from '../../domain/entities/terms-document';
import type {
  AnchorLike,
  TermsLinkCandidate,
  TermsLinkDiscoverer,
} from '../../domain/ports/content';

interface Keyword {
  readonly kind: TermsDocumentKind;
  readonly weight: number;
  readonly needle: string;
}

/**
 * Multilingual keyword table for finding legal links. Kept deliberately small
 * and high-signal across the languages Termsinator targets (en/de/es/fr/zh +
 * common others) so discovery stays programmatic and cheap — no LLM needed.
 */
const KEYWORDS: readonly Keyword[] = [
  // privacy
  { kind: 'privacy', weight: 0.9, needle: 'privacy' },
  { kind: 'privacy', weight: 0.9, needle: 'datenschutz' },
  { kind: 'privacy', weight: 0.9, needle: 'privacidad' },
  { kind: 'privacy', weight: 0.9, needle: 'privacidade' },
  { kind: 'privacy', weight: 0.9, needle: 'confidentialit' },
  { kind: 'privacy', weight: 0.9, needle: 'integritet' },
  { kind: 'privacy', weight: 0.9, needle: '隐私' },
  { kind: 'privacy', weight: 0.9, needle: 'プライバシー' },
  // terms
  { kind: 'terms', weight: 0.85, needle: 'terms' },
  { kind: 'terms', weight: 0.85, needle: 'conditions' },
  { kind: 'terms', weight: 0.85, needle: 'nutzungsbedingungen' },
  { kind: 'terms', weight: 0.8, needle: 'agb' },
  { kind: 'terms', weight: 0.85, needle: 'términos' },
  { kind: 'terms', weight: 0.85, needle: 'terminos' },
  { kind: 'terms', weight: 0.85, needle: 'termos' },
  { kind: 'terms', weight: 0.85, needle: 'condiciones' },
  { kind: 'terms', weight: 0.85, needle: '条款' },
  { kind: 'terms', weight: 0.85, needle: '利用規約' },
  // cookies
  { kind: 'cookies', weight: 0.5, needle: 'cookie' },
];

export class LinkTextTermsDiscoverer implements TermsLinkDiscoverer {
  discover(anchors: readonly AnchorLike[], baseUrl: string): readonly TermsLinkCandidate[] {
    const byUrl = new Map<string, TermsLinkCandidate>();

    for (const anchor of anchors) {
      const url = resolve(anchor.href, baseUrl);
      if (!url) continue;

      const haystackText = anchor.text.toLowerCase();
      const haystackHref = url.toLowerCase();

      for (const kw of KEYWORDS) {
        const inText = haystackText.includes(kw.needle.toLowerCase());
        const inHref = haystackHref.includes(kw.needle.toLowerCase());
        if (!inText && !inHref) continue;

        // Prefer matches in visible text; reward corroboration across text+href.
        const score = Math.min(1, kw.weight + (inText && inHref ? 0.1 : 0) - (inText ? 0 : 0.1));
        const existing = byUrl.get(url);
        if (!existing || score > existing.score) {
          byUrl.set(url, {
            url,
            kind: kw.kind,
            label: anchor.text.trim() || kw.needle,
            score: round2(score),
          });
        }
        break; // first matching keyword wins for this anchor
      }
    }

    return [...byUrl.values()].sort((a, b) => b.score - a.score);
  }
}

function resolve(href: string, baseUrl: string): string | null {
  const h = href.trim();
  if (!h || h.startsWith('#') || /^(mailto:|javascript:|tel:|data:)/i.test(h)) return null;
  try {
    const u = new URL(h, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
