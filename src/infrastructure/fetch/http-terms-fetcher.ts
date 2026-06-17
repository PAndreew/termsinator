import { type Result, ok, err } from '../../shared/result';
import type { RawDocument, TermsFetcher } from '../../domain/ports/content';

/**
 * Fetches legal pages from the background service worker (which holds host
 * permissions). Caps response size and time so a hostile/huge page can't stall
 * or balloon memory — in keeping with the "minimum resource use" goal.
 */
const MAX_BYTES = 2_000_000; // 2 MB of HTML is plenty for a policy page
const TIMEOUT_MS = 15_000;

export class HttpTermsFetcher implements TermsFetcher {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetch(url: string): Promise<Result<RawDocument, Error>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'follow',
        headers: { accept: 'text/html,application/xhtml+xml' },
      });
      if (!res.ok) return err(new Error(`HTTP ${res.status} for ${url}`));

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
        return err(new Error(`Unsupported content-type "${contentType}" for ${url}`));
      }

      const html = (await res.text()).slice(0, MAX_BYTES);
      return ok({ url, finalUrl: res.url || url, html, contentType });
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    } finally {
      clearTimeout(timer);
    }
  }
}
