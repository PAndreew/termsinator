import browser, { type Runtime } from 'webextension-polyfill';

import { AnalyzeSiteTerms } from '../../application/analyze-site-terms';
import { DetectProviderKeys } from '../../application/detect-provider-keys';
import { GetOrCreateAssessment } from '../../application/get-or-create-assessment';
import { SaveSettings } from '../../application/save-settings';

import { HtmlTextSanitizer } from '../../infrastructure/sanitizer/html-text-sanitizer';
import { HttpTermsFetcher } from '../../infrastructure/fetch/http-terms-fetcher';
import { DashboardKeyDetector } from '../../infrastructure/keys/dashboard-key-detector';
import { NavigatorLanguageDetector } from '../../infrastructure/language/navigator-language-detector';
import { DefaultLlmAnalyzerFactory } from '../../infrastructure/llm/llm-analyzer-factory';
import { ChunkingLlmAnalyzerFactory } from '../../infrastructure/llm/chunking-llm-analyzer';
import {
  BrowserAssessmentRepository,
  BrowserKeyVault,
  BrowserSettingsRepository,
} from '../../infrastructure/storage/storage-repositories';
import type { ExtensionStorage } from '../../infrastructure/storage/extension-storage';
import { SystemClock } from '../../infrastructure/platform/system-clock';
import { ConsoleLogger } from '../../infrastructure/platform/console-logger';

import { maskSecret, type ProviderKey } from '../../domain/entities/provider-key';
import { fingerprint } from '../../domain/services/fingerprint';
import { providerDisplayName } from '../../domain/value-objects/provider-id';
import type { SiteAssessment } from '../../domain/entities/site-assessment';

import {
  type BgRequest,
  type ContentCommand,
  type Envelope,
  type PopupState,
  publicKey,
} from '../messaging';
import type { AnalyzeSiteInput } from '../../application/analyze-site-terms';

const HOTKEY = 'Alt+Shift+T';

// ---- Composition root: build adapters once, inject into use cases. ----------
const storage = browser.storage.local as unknown as ExtensionStorage;
const clock = new SystemClock();
const logger = new ConsoleLogger('info');

const settingsRepo = new BrowserSettingsRepository(storage);
const keyVault = new BrowserKeyVault(storage);
const assessmentRepo = new BrowserAssessmentRepository(storage);

const analyzeSite = new AnalyzeSiteTerms({
  fetcher: new HttpTermsFetcher(),
  sanitizer: new HtmlTextSanitizer(),
  analyzerFactory: new ChunkingLlmAnalyzerFactory(
    new DefaultLlmAnalyzerFactory(globalThis.fetch.bind(globalThis)),
  ),
  keyVault,
  settings: settingsRepo,
  languageDetector: new NavigatorLanguageDetector(),
  repo: assessmentRepo,
  clock,
  logger,
});
const detectKeys = new DetectProviderKeys({
  detector: new DashboardKeyDetector(),
  keyVault,
  clock,
  logger,
});
const getOrCreate = new GetOrCreateAssessment(assessmentRepo, clock);
const saveSettings = new SaveSettings(settingsRepo);

// ---- Helpers ----------------------------------------------------------------
async function sendToTab(tabId: number, command: ContentCommand): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, command);
  } catch {
    // content script may not be present on this page (e.g. chrome:// URLs)
  }
}

async function analyzeTab(tabId: number): Promise<SiteAssessment | null> {
  let input: AnalyzeSiteInput;
  try {
    input = (await browser.tabs.sendMessage(tabId, { kind: 'collect' } as ContentCommand)) as AnalyzeSiteInput;
  } catch {
    return null;
  }
  const result = await analyzeSite.execute(input);
  await sendToTab(tabId, {
    kind: 'result',
    ok: result.ok,
    assessment: result.ok ? result.value : null,
    error: result.ok ? null : result.error.message,
  });
  return result.ok ? result.value : null;
}

async function activeTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

// ---- Request router ---------------------------------------------------------
async function handle(req: BgRequest, senderTabId: number | undefined): Promise<Envelope<unknown>> {
  switch (req.kind) {
    case 'analyzeActiveSite': {
      const result = await analyzeSite.execute(req.input);
      return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error.message };
    }
    case 'analyzeActiveTab': {
      const id = await activeTabId();
      if (id === null) return { ok: false, error: 'No active tab' };
      const assessment = await analyzeTab(id);
      return assessment ? { ok: true, data: assessment } : { ok: false, error: 'Analysis failed' };
    }
    case 'detectKeys': {
      const result = await detectKeys.execute(req.input);
      if (result.ok && result.value.length > 0 && senderTabId !== undefined) {
        await sendToTab(senderTabId, {
          kind: 'keyDetected',
          provider: providerDisplayName(result.value[0]!.provider),
        });
      }
      return result.ok ? { ok: true, data: result.value.map(publicKey) } : { ok: false, error: result.error.message };
    }
    case 'getPopupState': {
      const assessment = await getOrCreate.execute(req.origin, req.title);
      const settings = await settingsRepo.load();
      const keys = (await keyVault.list()).map(publicKey);
      const state: PopupState = { assessment, settings, keys };
      return { ok: true, data: state };
    }
    case 'getKeys':
      return { ok: true, data: (await keyVault.list()).map(publicKey) };
    case 'addManualKey': {
      const secret = req.secret.trim();
      if (secret.length < 8) return { ok: false, error: 'Key looks too short' };
      const key: ProviderKey = {
        id: `${req.provider}:${fingerprint(secret)}`,
        provider: req.provider,
        kind: 'api_key',
        secret,
        masked: maskSecret(secret),
        sourceHost: 'manual',
        createdAt: clock.now(),
      };
      await keyVault.add(key);
      return { ok: true, data: (await keyVault.list()).map(publicKey) };
    }
    case 'removeKey':
      await keyVault.remove(req.id);
      return { ok: true, data: (await keyVault.list()).map(publicKey) };
    case 'getSettings':
      return { ok: true, data: await settingsRepo.load() };
    case 'saveSettings': {
      const result = await saveSettings.execute(req.patch);
      return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error.message };
    }
    default:
      return { ok: false, error: 'Unknown request' };
  }
}

browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  // Returning a Promise lets the polyfill deliver the async response.
  return handle(message as BgRequest, sender.tab?.id).catch((e) => ({
    ok: false,
    error: e instanceof Error ? e.message : String(e),
  }));
});

// Hotkey → analyse the active tab.
browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'analyze-site') return;
  const id = await activeTabId();
  if (id !== null) await analyzeTab(id);
});

// Offer a gentle prompt the first time an un-assessed site is opened.
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (!/^https?:/.test(tab.url)) return;
  const settings = await settingsRepo.load();
  if (!settings.autoToast) return;
  const origin = new URL(tab.url).origin;
  const existing = await assessmentRepo.get(origin);
  if (existing && existing.status === 'ready') return;
  await sendToTab(tabId, { kind: 'prompt', hotkey: HOTKEY });
});

logger.log('info', 'Termsinator background ready');
