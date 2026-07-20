import type { AssessmentRepository, SettingsRepository } from '../domain/ports/repositories';
import type { HubClient } from '../domain/ports/hub';
import { communityKey } from '../domain/services/community-evidence';

export interface SyncToHubDeps {
  readonly repo: AssessmentRepository;
  readonly hubClient: HubClient;
  readonly settings: SettingsRepository;
}

export interface SyncResult {
  submitted: number;
  skipped: number;
}

/**
 * Pushes all locally-stored ready assessments to the community hub, provided
 * the user has opted in to sharing. Hub persistence is idempotent for a
 * contributor and analysis key, so retrying an interrupted sync is safe.
 *
 * Called once when the user flips shareAnalyses from false → true, so they
 * contribute their existing local history without having to re-analyse every site.
 */
export class SyncToHub {
  constructor(private readonly deps: SyncToHubDeps) {}

  async execute(): Promise<SyncResult> {
    const cfg = await this.deps.settings.load();
    if (!cfg.shareAnalyses || !cfg.hubUrl) {
      return { submitted: 0, skipped: 0 };
    }

    const all = await this.deps.repo.list();
    let submitted = 0;
    let skipped = 0;

    for (const site of all) {
      if (site.status !== 'ready' || !site.assessment || !site.termsHash ||
          site.assessment.provenance.mode === 'hub') {
        skipped++;
        continue;
      }

      const key = communityKey(site.termsHash, site.assessment.language);
      await this.deps.hubClient.submit(site.origin, key, site.assessment, site.documents);
      submitted++;
    }

    return { submitted, skipped };
  }
}
