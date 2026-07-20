import type { SiteAssessment } from '../entities/site-assessment';
import type { Settings } from '../entities/settings';
import type { ProviderKey } from '../entities/provider-key';
import type { ProviderId } from '../value-objects/provider-id';
import type { ContributorIdentity } from '../entities/contributor-identity';

export interface AssessmentRepository {
  get(origin: string): Promise<SiteAssessment | null>;
  save(assessment: SiteAssessment): Promise<void>;
  remove(origin: string): Promise<void>;
  list(): Promise<SiteAssessment[]>;
}

export interface SettingsRepository {
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

export interface ContributorIdentityRepository {
  load(): Promise<ContributorIdentity | null>;
  save(identity: ContributorIdentity): Promise<void>;
}

/** Stores BYOK secrets on-device. Kept separate from settings for clarity. */
export interface KeyVault {
  list(): Promise<readonly ProviderKey[]>;
  add(key: ProviderKey): Promise<void>;
  remove(id: string): Promise<void>;
  /** The credential to use for analysis, honouring an optional preference. */
  active(preferred: ProviderId | null): Promise<ProviderKey | null>;
}
