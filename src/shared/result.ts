/**
 * A tiny Result type so use cases can model failure without throwing across
 * the (async, message-passing) extension boundary. Keeps the domain pure and
 * makes error paths explicit in tests.
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;

export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;

/** Map the success channel, leaving errors untouched. */
export function mapResult<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Unwrap or throw — only for the composition root / tests, never in domain logic. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(String(r.error));
}
