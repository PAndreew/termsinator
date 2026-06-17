import { describe, it, expect } from 'vitest';
import { HtmlTextSanitizer } from './html-text-sanitizer';

const s = new HtmlTextSanitizer();

describe('HtmlTextSanitizer', () => {
  it('extracts the title and strips scripts/styles entirely', () => {
    const html = `<html><head><title>Privacy &amp; Terms</title><style>.x{}</style></head>
      <body><script>evil()</script><p>We respect your privacy.</p></body></html>`;
    const out = s.sanitize(html);
    expect(out.title).toBe('Privacy & Terms');
    expect(out.text).toContain('We respect your privacy.');
    expect(out.text).not.toContain('evil');
    expect(out.text).not.toContain('.x{}');
  });

  it('removes nav/header/footer/forms boilerplate', () => {
    const html = `<body><nav>Home Login</nav><header>Logo</header>
      <p>Actual policy text.</p><footer>Copyright</footer><form><button>Submit</button></form></body>`;
    const out = s.sanitize(html);
    expect(out.text).toContain('Actual policy text.');
    expect(out.text).not.toMatch(/Home Login|Logo|Copyright|Submit/);
  });

  it('focuses on <main> when present', () => {
    const long = 'Important clause about data retention. '.repeat(10);
    const html = `<body><div>sidebar junk</div><main><p>${long}</p></main></body>`;
    const out = s.sanitize(html);
    expect(out.text).toContain('Important clause about data retention.');
    expect(out.text).not.toContain('sidebar junk');
  });

  it('decodes numeric and named entities', () => {
    const out = s.sanitize('<p>Caf&#233; &amp; t&eacute;a &#x41;</p>');
    expect(out.text).toContain('Café');
    expect(out.text).toContain('&');
    expect(out.text).toContain('A');
  });

  it('collapses whitespace aggressively for token efficiency', () => {
    const out = s.sanitize('<p>a</p>\n\n\n   <p>b</p>      <p>c</p>');
    expect(out.text).not.toMatch(/ {2,}/);
    expect(out.text).not.toMatch(/\n{3,}/);
  });

  it('enforces the token budget and flags truncation', () => {
    const html = `<p>${'word '.repeat(5000)}</p>`; // ~25k chars
    const out = s.sanitize(html, { maxTokens: 100 }); // 100*4 = 400 chars
    expect(out.text.length).toBeLessThanOrEqual(400);
    expect(out.truncated).toBe(true);
    expect(out.approxTokens).toBeLessThanOrEqual(100);
  });

  it('reports an approximate token count near chars/4', () => {
    const out = s.sanitize('<p>abcdefgh</p>'); // 8 content chars
    expect(out.approxTokens).toBe(2);
    expect(out.truncated).toBe(false);
  });
});
