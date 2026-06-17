import { type Result, ok, err } from '../../shared/result';

/** The slice of the Fetch API the analyzers need; injectable for testing. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;

/** POSTs JSON and returns the parsed body, surfacing HTTP/network errors as Result. */
export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Result<unknown, Error>> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return err(new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`));
    }
    return ok(await res.json());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/** Safely walk a parsed JSON value by a path of keys/indexes. */
export function dig(value: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = value;
  for (const key of path) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof key === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[key];
    } else {
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
  }
  return cur;
}
