/**
 * The lenses Termsinator scores a terms/privacy document through. "Common sense"
 * is the layman fairness view; the others map to concrete legal regimes the user
 * named (GDPR, California CCPA/CPRA) plus two cross-cutting concerns.
 */
export const LEGAL_FRAMEWORKS = [
  'common_sense',
  'gdpr',
  'ccpa',
  'data_sharing',
  'data_retention',
] as const;

export type LegalFramework = (typeof LEGAL_FRAMEWORKS)[number];

const LABELS: Record<LegalFramework, string> = {
  common_sense: 'Common sense',
  gdpr: 'GDPR (EU)',
  ccpa: 'CCPA/CPRA (California)',
  data_sharing: 'Data sharing',
  data_retention: 'Data retention',
};

export function frameworkLabel(f: LegalFramework): string {
  return LABELS[f];
}

export function isLegalFramework(value: string): value is LegalFramework {
  return (LEGAL_FRAMEWORKS as readonly string[]).includes(value);
}
