import type { HtmlSanitizer, SanitizeOptions, SanitizedContent } from '../../domain/ports/content';

/**
 * DOM-free HTML → plain-text sanitiser. Built for token efficiency and for the
 * MV3 service worker (which has no DOMParser): it removes non-content regions
 * (scripts, styles, nav/header/footer/forms, SVG), strips remaining tags,
 * decodes common entities, collapses whitespace and enforces a token budget.
 *
 * ~4 characters ≈ 1 token is the standard rough estimate used to cap input.
 */
const CHARS_PER_TOKEN = 4;

const STRIP_BLOCKS =
  /<(script|style|noscript|template|svg|head|nav|header|footer|form|aside|iframe|button|select)\b[^>]*>[\s\S]*?<\/\1>/gi;

const BLOCK_LEVEL = /<\/(p|div|section|article|li|tr|h[1-6]|br|ul|ol|table|main)\s*>/gi;

export class HtmlTextSanitizer implements HtmlSanitizer {
  sanitize(html: string, options: SanitizeOptions = {}): SanitizedContent {
    const title = extractTitle(html);

    let body = html.replace(STRIP_BLOCKS, ' ');
    body = preferMainRegion(body);
    body = body.replace(/<!--[\s\S]*?-->/g, ' ');
    // keep paragraph/line structure before dropping the rest of the markup
    body = body.replace(BLOCK_LEVEL, '\n');
    body = body.replace(/<[^>]+>/g, ' ');
    body = decodeEntities(body);
    body = collapseWhitespace(body);

    const maxChars = (options.maxTokens ?? Number.POSITIVE_INFINITY) * CHARS_PER_TOKEN;
    const truncated = body.length > maxChars;
    const text = truncated ? body.slice(0, maxChars).trimEnd() : body;

    return {
      title,
      text,
      approxTokens: Math.ceil(text.length / CHARS_PER_TOKEN),
      truncated,
    };
  }
}

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (m && m[1]) return decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && h1[1]) return decodeEntities(h1[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return '';
}

/** If a <main> or <article> exists, focus on it to drop chrome/boilerplate. */
function preferMainRegion(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (main && main[1] && main[1].length > 200) return main[1];
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (article && article[1] && article[1].length > 200) return article[1];
  return html;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d: string) => safeFromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeFromCharCode(parseInt(h, 16)));
}

function safeFromCharCode(code: number): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

function collapseWhitespace(input: string): string {
  return input
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
