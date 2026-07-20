import type { ContributorAuthenticator, HubClient, HubConsensus, HubKey, HubReport, HubReportSummary } from '../../domain/ports/hub';
import type { RiskAssessment } from '../../domain/entities/risk-assessment';
import type { TermsDocument } from '../../domain/entities/terms-document';
import type { SettingsRepository } from '../../domain/ports/repositories';

const LOOKUP_TIMEOUT_MS = 5_000; const SUBMIT_TIMEOUT_MS = 10_000;

export class SettingsAwareHubClient implements HubClient {
  constructor(private readonly settingsRepo: SettingsRepository, private readonly authenticator: ContributorAuthenticator) {}
  async lookup(key: HubKey): Promise<HubConsensus | null> {
    const cfg = await this.settingsRepo.load(); if (!cfg.hubUrl) return null;
    const params = new URLSearchParams(Object.entries(key)); try {
      const res = await fetch(`${cfg.hubUrl}/v2/analyses?${params}`, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      const body = await res.json() as { ok: boolean; data?: HubConsensus }; return res.ok && body.ok ? body.data ?? null : null;
    } catch { return null; }
  }
  async listReports(origin: string, language: string): Promise<readonly HubReportSummary[]> {
    const cfg = await this.settingsRepo.load(); if (!cfg.hubUrl) return [];
    const query = new URLSearchParams({ origin, language });
    try { const res = await fetch(`${cfg.hubUrl}/v2/reports?${query}`, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      const body = await res.json() as { ok: boolean; data?: HubReportSummary[] }; return res.ok && body.ok ? body.data ?? [] : []; } catch { return []; }
  }
  async getReport(id: number): Promise<HubReport | null> {
    const cfg = await this.settingsRepo.load(); if (!cfg.hubUrl) return null;
    try { const res = await fetch(`${cfg.hubUrl}/v2/reports/${id}`, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      const body = await res.json() as { ok: boolean; data?: HubReport }; return res.ok && body.ok ? body.data ?? null : null; } catch { return null; }
  }
  async submit(origin: string, key: HubKey, assessment: RiskAssessment, _documents: readonly TermsDocument[]): Promise<void> {
    const cfg = await this.settingsRepo.load(); if (!cfg.shareAnalyses || !cfg.hubUrl) return;
    const body = JSON.stringify({ origin, ...key, provider: assessment.provenance.provider, model: assessment.provenance.model, assessment, findings: [] });
    try {
      let headers = await this.authenticator.signedHeaders(cfg.hubUrl, body); if (!headers) return;
      let response = await fetch(`${cfg.hubUrl}/v2/analyses`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body, signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS) });
      if (response.status === 401) { await this.authenticator.forgetRegistration(cfg.hubUrl); headers = await this.authenticator.signedHeaders(cfg.hubUrl, body);
        if (headers) response = await fetch(`${cfg.hubUrl}/v2/analyses`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body, signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS) }); }
      void response;
    } catch { /* best effort */ }
  }
}
