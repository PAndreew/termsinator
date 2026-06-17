import browser from 'webextension-polyfill';
import type { BgRequest, Envelope } from '../messaging';
import type { Settings } from '../../domain/entities/settings';
import { Language, type SupportedUiLocale } from '../../domain/value-objects/language';

/** Sends a typed request to the background and unwraps the response. */
export async function request<T>(req: BgRequest): Promise<T> {
  const res = (await browser.runtime.sendMessage(req)) as Envelope<T>;
  if (!res || !res.ok) throw new Error(res?.error ?? 'No response from background');
  return res.data;
}

/** The active tab's origin + title, used to scope popup state. */
export async function activeOrigin(): Promise<{ origin: string; title: string }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) return { origin: '', title: tab?.title ?? '' };
  return { origin: new URL(tab.url).origin, title: tab.title ?? new URL(tab.url).host };
}

/** Resolve the UI locale from settings override, else the browser language. */
export function uiLocale(settings: Settings | null): SupportedUiLocale {
  if (settings?.languageOverride) return Language.fromOrDefault(settings.languageOverride).uiLocale;
  return Language.fromOrDefault(navigator.language).uiLocale;
}
