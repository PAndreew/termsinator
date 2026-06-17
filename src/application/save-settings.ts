import { type Result, ok, err } from '../shared/result';
import type { Settings } from '../domain/entities/settings';
import type { SettingsRepository } from '../domain/ports/repositories';

/** A partial patch of settings the UI may submit. */
export type SettingsPatch = Partial<Settings>;

/**
 * Merges and validates a settings patch, then persists. Validation keeps the
 * token budget sane so the analysis pipeline can't be starved or made wasteful.
 */
export class SaveSettings {
  constructor(private readonly settings: SettingsRepository) {}

  async execute(patch: SettingsPatch): Promise<Result<Settings, Error>> {
    const current = await this.settings.load();
    const merged: Settings = { ...current, ...patch };

    if (!Number.isFinite(merged.maxTokens) || merged.maxTokens < 500 || merged.maxTokens > 50_000) {
      return err(new Error('maxTokens must be between 500 and 50000'));
    }
    if (merged.languageOverride !== null && !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(merged.languageOverride)) {
      return err(new Error('languageOverride must be a valid language tag or null'));
    }

    await this.settings.save(merged);
    return ok(merged);
  }
}
