import type { SiteAssessment } from '../../domain/entities/site-assessment';
import { type Settings, DEFAULT_SETTINGS } from '../../domain/entities/settings';
import type { ProviderKey } from '../../domain/entities/provider-key';
import type { ProviderId } from '../../domain/value-objects/provider-id';
import type {
  AssessmentRepository,
  KeyVault,
  SettingsRepository,
  ContributorIdentityRepository,
} from '../../domain/ports/repositories';
import type { ContributorIdentity } from '../../domain/entities/contributor-identity';
import type { ExtensionStorage } from './extension-storage';

const SETTINGS_KEY = 'settings';
const KEYS_KEY = 'keys';
const ASSESSMENT_PREFIX = 'assessment:';
const ORIGINS_INDEX_KEY = 'assessment_origins';
const CONTRIBUTOR_IDENTITY_KEY = 'contributor_identity';

/** Settings persisted under a single key, always merged over defaults. */
export class BrowserSettingsRepository implements SettingsRepository {
  constructor(private readonly storage: ExtensionStorage) {}

  async load(): Promise<Settings> {
    const raw = (await this.storage.get(SETTINGS_KEY))[SETTINGS_KEY];
    return { ...DEFAULT_SETTINGS, ...(isObject(raw) ? (raw as Partial<Settings>) : {}) };
  }

  async save(settings: Settings): Promise<void> {
    await this.storage.set({ [SETTINGS_KEY]: settings });
  }
}

export class BrowserContributorIdentityRepository implements ContributorIdentityRepository {
  constructor(private readonly storage: ExtensionStorage) {}
  async load(): Promise<ContributorIdentity | null> {
    const raw = (await this.storage.get(CONTRIBUTOR_IDENTITY_KEY))[CONTRIBUTOR_IDENTITY_KEY];
    return isObject(raw) ? raw as unknown as ContributorIdentity : null;
  }
  async save(identity: ContributorIdentity): Promise<void> { await this.storage.set({ [CONTRIBUTOR_IDENTITY_KEY]: identity }); }
}

/** BYOK credentials stored as a single array under one key. */
export class BrowserKeyVault implements KeyVault {
  constructor(private readonly storage: ExtensionStorage) {}

  async list(): Promise<readonly ProviderKey[]> {
    const raw = (await this.storage.get(KEYS_KEY))[KEYS_KEY];
    return Array.isArray(raw) ? (raw as ProviderKey[]) : [];
  }

  async add(key: ProviderKey): Promise<void> {
    const keys = [...(await this.list())];
    if (keys.some((k) => k.id === key.id)) return;
    keys.push(key);
    await this.storage.set({ [KEYS_KEY]: keys });
  }

  async remove(id: string): Promise<void> {
    const keys = (await this.list()).filter((k) => k.id !== id);
    await this.storage.set({ [KEYS_KEY]: keys });
  }

  async active(preferred: ProviderId | null): Promise<ProviderKey | null> {
    const keys = await this.list();
    if (preferred) return keys.find((k) => k.provider === preferred) ?? keys[0] ?? null;
    return keys[0] ?? null;
  }
}

/** One stored record per site origin, keyed by `assessment:<origin>`. */
export class BrowserAssessmentRepository implements AssessmentRepository {
  constructor(private readonly storage: ExtensionStorage) {}

  private key(origin: string): string {
    return `${ASSESSMENT_PREFIX}${origin}`;
  }

  async get(origin: string): Promise<SiteAssessment | null> {
    const raw = (await this.storage.get(this.key(origin)))[this.key(origin)];
    return isObject(raw) ? (raw as unknown as SiteAssessment) : null;
  }

  async save(assessment: SiteAssessment): Promise<void> {
    const origins = await this.loadOrigins();
    if (!origins.includes(assessment.origin)) {
      await this.storage.set({ [ORIGINS_INDEX_KEY]: [...origins, assessment.origin] });
    }
    await this.storage.set({ [this.key(assessment.origin)]: assessment });
  }

  async remove(origin: string): Promise<void> {
    const origins = (await this.loadOrigins()).filter((o) => o !== origin);
    await this.storage.set({ [ORIGINS_INDEX_KEY]: origins });
    await this.storage.remove(this.key(origin));
  }

  async list(): Promise<SiteAssessment[]> {
    const origins = await this.loadOrigins();
    const all = await Promise.all(origins.map((o) => this.get(o)));
    return all.filter((a): a is SiteAssessment => a !== null);
  }

  private async loadOrigins(): Promise<string[]> {
    const raw = (await this.storage.get(ORIGINS_INDEX_KEY))[ORIGINS_INDEX_KEY];
    return Array.isArray(raw) ? (raw as string[]) : [];
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
