import type { AnalyzeSiteInput } from '../application/analyze-site-terms';
import type { SettingsPatch } from '../application/save-settings';
import type { KeyDetectionInput } from '../domain/ports/detection';
import type { SiteAssessment } from '../domain/entities/site-assessment';
import type { Settings } from '../domain/entities/settings';
import type { ProviderKey } from '../domain/entities/provider-key';
import type { ProviderId } from '../domain/value-objects/provider-id';

/** Credential as exposed to the UI — never includes the raw secret. */
export type PublicKey = Omit<ProviderKey, 'secret'>;

/** Requests the background service worker handles (from popup or content). */
export type BgRequest =
  | { kind: 'analyzeActiveSite'; input: AnalyzeSiteInput }
  | { kind: 'analyzeActiveTab' }
  | { kind: 'detectKeys'; input: KeyDetectionInput }
  | { kind: 'getPopupState'; origin: string; title: string }
  | { kind: 'getKeys' }
  | { kind: 'addManualKey'; provider: ProviderId; secret: string }
  | { kind: 'removeKey'; id: string }
  | { kind: 'getSettings' }
  | { kind: 'saveSettings'; patch: SettingsPatch };

/** Messages the background sends down to a tab's content script. */
export type ContentCommand =
  | { kind: 'collect' }
  | { kind: 'result'; ok: boolean; assessment: SiteAssessment | null; error: string | null }
  | { kind: 'prompt'; hotkey: string }
  | { kind: 'keyDetected'; provider: string };

export interface PopupState {
  readonly assessment: SiteAssessment;
  readonly settings: Settings;
  readonly keys: readonly PublicKey[];
}

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export function publicKey(key: ProviderKey): PublicKey {
  const { secret: _secret, ...rest } = key;
  return rest;
}
