import type { RiskAssessment } from '../entities/risk-assessment';
import type { TermsDocument } from '../entities/terms-document';
import type { EvidenceFinding } from '../services/community-evidence';

export interface HubKey { readonly documentSetHash: string; readonly language: string; readonly analysisSchemaVersion: string; readonly promptVersion: string }
export interface HubConsensus {
  readonly reusable: true;
  readonly confidence: 'moderate' | 'high';
  readonly contributorCount: number;
  readonly modelCount: number;
  readonly overallScore: number;
  readonly frameworkScores: Readonly<Record<string, number>>;
  readonly disagreement: number;
  readonly findings: readonly (EvidenceFinding & { readonly confirmationCount: number })[];
}
export interface HubReportSummary {
  readonly id: number; readonly origin: string; readonly documentSetHash: string; readonly language: string;
  readonly analysisSchemaVersion: string; readonly promptVersion: string;
  readonly provider: string | null; readonly model: string | null; readonly grade: string;
  readonly score: number | null; readonly coverage: number; readonly confidence: string;
  readonly issueCount: number; readonly actionCount: number; readonly createdAt: number;
}
export interface HubReport extends HubReportSummary { readonly assessment: RiskAssessment }
export interface HubClient {
  lookup(key: HubKey): Promise<HubConsensus | null>;
  listReports(origin: string, language: string): Promise<readonly HubReportSummary[]>;
  getReport(id: number): Promise<HubReport | null>;
  submit(origin: string, key: HubKey, assessment: RiskAssessment, documents: readonly TermsDocument[]): Promise<void>;
}

export interface ContributorAuthenticator {
  signedHeaders(hubUrl: string, body: string): Promise<Record<string, string> | null>;
  forgetRegistration(hubUrl: string): Promise<void>;
}
