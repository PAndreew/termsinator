import type { SiteAssessment } from '../domain/entities/site-assessment';
import { idleAssessment } from '../domain/entities/site-assessment';
import type { AssessmentRepository } from '../domain/ports/repositories';
import type { Clock } from '../domain/ports/platform';

/**
 * Returns the stored assessment for an origin, or a fresh idle placeholder if
 * none exists yet. Read-only — used by the popup to render current state without
 * triggering analysis.
 */
export class GetOrCreateAssessment {
  constructor(
    private readonly repo: AssessmentRepository,
    private readonly clock: Clock,
  ) {}

  async execute(origin: string, title: string): Promise<SiteAssessment> {
    const existing = await this.repo.get(origin);
    return existing ?? idleAssessment(origin, title, this.clock.now());
  }
}
