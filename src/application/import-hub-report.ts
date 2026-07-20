import { err, ok, type Result } from '../shared/result';
import type { SiteAssessment } from '../domain/entities/site-assessment';
import type { HubClient } from '../domain/ports/hub';
import type { AssessmentRepository } from '../domain/ports/repositories';
import type { Clock } from '../domain/ports/platform';
import { ANALYSIS_SCHEMA_VERSION, PROMPT_VERSION } from '../domain/services/community-evidence';

export class ImportHubReport {
  constructor(private readonly hub: HubClient, private readonly repo: AssessmentRepository, private readonly clock: Clock) {}

  async execute(id: number, origin: string, title: string): Promise<Result<SiteAssessment, Error>> {
    const report = await this.hub.getReport(id);
    if (!report || report.origin !== origin) return err(new Error('Hub report not found for this site'));
    if (report.analysisSchemaVersion !== ANALYSIS_SCHEMA_VERSION || report.promptVersion !== PROMPT_VERSION ||
        report.assessment.schemaVersion !== '3' || report.assessment.promptVersion !== '3') {
      return err(new Error('Hub report uses an unsupported analysis version'));
    }
    const site: SiteAssessment = {
      origin,
      title,
      status: 'ready',
      documents: [],
      assessment: {
        ...report.assessment,
        provenance: { mode: 'hub', provider: null, model: report.model },
      },
      error: null,
      updatedAt: this.clock.now(),
      termsHash: report.documentSetHash,
      policyUrls: [],
    };
    await this.repo.save(site);
    return ok(site);
  }
}
