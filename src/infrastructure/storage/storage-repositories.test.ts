import { describe, it, expect } from 'vitest';
import {
  BrowserSettingsRepository,
  BrowserKeyVault,
  BrowserAssessmentRepository,
  BrowserContributorIdentityRepository,
} from './storage-repositories';
import { MemoryExtensionStorage } from './extension-storage';
import { DEFAULT_SETTINGS } from '../../domain/entities/settings';
import type { ProviderKey } from '../../domain/entities/provider-key';
import type { SiteAssessment } from '../../domain/entities/site-assessment';

const key = (id: string, provider: ProviderKey['provider']): ProviderKey => ({
  id,
  provider,
  kind: 'api_key',
  secret: 's',
  masked: 'm',
  sourceHost: 'h',
  createdAt: 1,
});

describe('BrowserSettingsRepository', () => {
  it('returns defaults when nothing stored, merging partials on load', async () => {
    const storage = new MemoryExtensionStorage();
    const repo = new BrowserSettingsRepository(storage);
    expect(await repo.load()).toEqual(DEFAULT_SETTINGS);

    await storage.set({ settings: { autoToast: false } });
    const loaded = await repo.load();
    expect(loaded.autoToast).toBe(false);
    expect(loaded.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens); // default filled in
  });

  it('round-trips saved settings', async () => {
    const repo = new BrowserSettingsRepository(new MemoryExtensionStorage());
    await repo.save({ ...DEFAULT_SETTINGS, languageOverride: 'fr' });
    expect((await repo.load()).languageOverride).toBe('fr');
  });
});

describe('BrowserContributorIdentityRepository', () => {
  it('persists the private identity separately from user settings', async () => {
    const storage = new MemoryExtensionStorage(); const repo = new BrowserContributorIdentityRepository(storage);
    const identity = { publicKey: { kty: 'EC' }, privateKey: { kty: 'EC', d: 'private' }, registrations: {} };
    expect(await repo.load()).toBeNull(); await repo.save(identity); expect(await repo.load()).toEqual(identity);
    expect((await storage.get('settings')).settings).toBeUndefined();
  });
});

describe('BrowserKeyVault', () => {
  it('adds, de-duplicates, lists and removes keys', async () => {
    const vault = new BrowserKeyVault(new MemoryExtensionStorage());
    await vault.add(key('a', 'openai'));
    await vault.add(key('a', 'openai')); // dup id ignored
    await vault.add(key('b', 'anthropic'));
    expect(await vault.list()).toHaveLength(2);

    await vault.remove('a');
    expect((await vault.list()).map((k) => k.id)).toEqual(['b']);
  });

  it('resolves the active key, honouring a preference', async () => {
    const vault = new BrowserKeyVault(new MemoryExtensionStorage());
    await vault.add(key('a', 'openai'));
    await vault.add(key('b', 'anthropic'));
    expect((await vault.active('anthropic'))?.id).toBe('b');
    expect((await vault.active(null))?.id).toBe('a'); // first when no preference
    expect((await vault.active('google'))?.id).toBe('a'); // preference absent -> first
  });
});

const assessment = (origin: string, title = 'T'): SiteAssessment => ({
  origin,
  title,
  status: 'ready',
  documents: [],
  assessment: null,
  error: null,
  updatedAt: 1,
  termsHash: null,
  policyUrls: [],
});

describe('BrowserAssessmentRepository', () => {
  it('stores and retrieves assessments per origin', async () => {
    const repo = new BrowserAssessmentRepository(new MemoryExtensionStorage());
    const a = assessment('https://x.example', 'X');
    expect(await repo.get('https://x.example')).toBeNull();
    await repo.save(a);
    expect((await repo.get('https://x.example'))?.title).toBe('X');
    await repo.remove('https://x.example');
    expect(await repo.get('https://x.example')).toBeNull();
  });

  it('list returns all saved assessments', async () => {
    const repo = new BrowserAssessmentRepository(new MemoryExtensionStorage());
    expect(await repo.list()).toHaveLength(0);

    await repo.save(assessment('https://a.example'));
    await repo.save(assessment('https://b.example'));
    const all = await repo.list();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.origin).sort()).toEqual(['https://a.example', 'https://b.example']);
  });

  it('list excludes removed assessments', async () => {
    const repo = new BrowserAssessmentRepository(new MemoryExtensionStorage());
    await repo.save(assessment('https://a.example'));
    await repo.save(assessment('https://b.example'));
    await repo.remove('https://a.example');
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.origin).toBe('https://b.example');
  });

  it('list deduplicates when same origin saved twice', async () => {
    const repo = new BrowserAssessmentRepository(new MemoryExtensionStorage());
    await repo.save(assessment('https://a.example', 'First'));
    await repo.save({ ...assessment('https://a.example'), title: 'Updated' });
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('Updated');
  });
});
