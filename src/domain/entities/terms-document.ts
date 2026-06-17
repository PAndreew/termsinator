/** What kind of legal page this is — drives prompt framing and discovery priority. */
export type TermsDocumentKind = 'terms' | 'privacy' | 'cookies' | 'other';

/**
 * A legal document after fetching + sanitisation. `text` is already stripped of
 * markup/boilerplate (token-efficient); `approxTokens` lets the pipeline enforce
 * a budget before calling an LLM.
 */
export interface TermsDocument {
  readonly url: string;
  readonly kind: TermsDocumentKind;
  readonly title: string;
  readonly text: string;
  readonly approxTokens: number;
}
