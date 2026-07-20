import type { TermsDocument } from './terms-document';
import type { RiskAssessment } from './risk-assessment';

export type AssessmentStatus = 'idle' | 'analyzing' | 'ready' | 'error';

/**
 * Everything Termsinator knows about a single site origin. Persisted so a site
 * is only analysed once until its documents change (token-efficient).
 */
export interface SiteAssessment {
  readonly origin: string;
  readonly title: string;
  readonly status: AssessmentStatus;
  readonly documents: readonly TermsDocument[];
  readonly assessment: RiskAssessment | null;
  readonly error: string | null;
  readonly updatedAt: number;
  /** SHA-256 of the fetched document texts — used for local and hub cache hits. */
  readonly termsHash: string | null;
  /** Policy page URLs analysed — used for lightweight stale detection on page load. */
  readonly policyUrls: readonly string[];
}

export function idleAssessment(origin: string, title: string, now: number): SiteAssessment {
  return {
    origin,
    title,
    status: 'idle',
    documents: [],
    assessment: null,
    error: null,
    updatedAt: now,
    termsHash: null,
    policyUrls: [],
  };
}
