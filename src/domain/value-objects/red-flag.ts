import type { LegalFramework } from './legal-framework';

/**
 * A single concerning clause found in a document. `weight` is how much risk this
 * flag contributes (0..100) to each framework it `affects`. `messageKey` is an
 * i18n key so the UI can render the explanation in the user's language; `evidence`
 * is the (short) matched snippet for transparency.
 */
export interface RedFlag {
  readonly id: string;
  readonly messageKey: string;
  readonly affects: readonly LegalFramework[];
  readonly weight: number;
  readonly evidence: string;
}

export function makeRedFlag(
  id: string,
  messageKey: string,
  affects: readonly LegalFramework[],
  weight: number,
  evidence: string,
): RedFlag {
  return {
    id,
    messageKey,
    affects,
    weight: Math.min(100, Math.max(0, weight)),
    evidence: evidence.slice(0, 200),
  };
}
