/**
 * The slice of `browser.storage.local` the repositories depend on. Abstracted so
 * repositories are testable with an in-memory implementation and don't import
 * the polyfill directly.
 */
export interface ExtensionStorage {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** In-memory store for tests and as a safe fallback outside an extension. */
export class MemoryExtensionStorage implements ExtensionStorage {
  readonly data = new Map<string, unknown>();

  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null) return Object.fromEntries(this.data);
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const k of list) if (this.data.has(k)) out[k] = this.data.get(k);
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) this.data.set(k, v);
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.data.delete(k);
  }
}
