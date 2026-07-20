import browser, { type Runtime } from 'webextension-polyfill';

import { AnalyzeSiteTerms } from '../../application/analyze-site-terms';
import { DetectProviderKeys } from '../../application/detect-provider-keys';
import { GetOrCreateAssessment } from '../../application/get-or-create-assessment';
import { SaveSettings } from '../../application/save-settings';
import { SyncToHub } from '../../application/sync-to-hub';
import { ImportHubReport } from '../../application/import-hub-report';
import { policyUrlsChanged } from '../../application/policy-staleness';

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
  BrowserContributorIdentityRepository,
} from '../../infrastructure/storage/storage-repositories';
import type { ExtensionStorage } from '../../infrastructure/storage/extension-storage';
import { SystemClock } from '../../infrastructure/platform/system-clock';
import { ConsoleLogger } from '../../infrastructure/platform/console-logger';

import { SettingsAwareHubClient } from '../../infrastructure/hub/settings-aware-hub-client';
import { WebCryptoContributorAuthenticator } from '../../infrastructure/hub/webcrypto-contributor-authenticator';
import { LinkTextTermsDiscoverer } from '../../infrastructure/discovery/link-text-terms-discoverer';
import { maskSecret, type ProviderKey } from '../../domain/entities/provider-key';
import { fingerprint } from '../../domain/services/fingerprint';
import { providerDisplayName } from '../../domain/value-objects/provider-id';
import type { SiteAssessment } from '../../domain/entities/site-assessment';
import { Language } from '../../domain/value-objects/language';

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
const contributorIdentityRepo = new BrowserContributorIdentityRepository(storage);

const hubClient = new SettingsAwareHubClient(settingsRepo, new WebCryptoContributorAuthenticator(contributorIdentityRepo));

const analyzeSite = new AnalyzeSiteTerms({
  fetcher: new HttpTermsFetcher(globalThis.fetch.bind(globalThis)),
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
  hubClient,
  discoverer: new LinkTextTermsDiscoverer(),
});
const detectKeys = new DetectProviderKeys({
  detector: new DashboardKeyDetector(),
  keyVault,
  clock,
  logger,
});
const getOrCreate = new GetOrCreateAssessment(assessmentRepo, clock);
const saveSettings = new SaveSettings(settingsRepo);
const syncToHub = new SyncToHub({ repo: assessmentRepo, hubClient, settings: settingsRepo });
const importHubReport = new ImportHubReport(hubClient, assessmentRepo, clock);

// ---- Helpers ----------------------------------------------------------------
async function sendToTab(tabId: number, command: ContentCommand): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, command);
  } catch {
    // content script may not be present on this page (e.g. chrome:// URLs)
  }
}

const BADGE_GRADE_COLOR: Record<string, string> = { A: '#16a34a', B: '#4d7c0f', C: '#ca8a04', D: '#ea580c', F: '#dc2626' };

async function analyzeTab(tabId: number): Promise<{ assessment: SiteAssessment | null; error: string | null }> {
  let input: AnalyzeSiteInput;
  try {
    input = (await browser.tabs.sendMessage(tabId, { kind: 'collect' } as ContentCommand)) as AnalyzeSiteInput;
  } catch (e) {
    const msg = 'Content script not responding — reload the page and try again';
    logger.log('warn', msg, { error: String(e) });
    return { assessment: null, error: msg };
  }

  // Show "analysing" indicator — persists even if user navigates away.
  await sendToTab(tabId, { kind: 'analyzing', origin: input.origin });
  void browser.action.setBadgeText({ text: '…', tabId });
  void browser.action.setBadgeBackgroundColor({ color: '#6366f1', tabId });

  const result = await analyzeSite.execute(input);
  const errorMsg = result.ok ? null : result.error.message;

  if (result.ok) {
    const grade = result.value.assessment?.grade ?? '?';
    void browser.action.setBadgeText({ text: grade, tabId });
    void browser.action.setBadgeBackgroundColor({ color: BADGE_GRADE_COLOR[grade] ?? '#6b7280', tabId });
  } else {
    void browser.action.setBadgeText({ text: '!', tabId });
    void browser.action.setBadgeBackgroundColor({ color: '#dc2626', tabId });
  }

  await sendToTab(tabId, {
    kind: 'result',
    ok: result.ok,
    assessment: result.ok ? result.value : null,
    error: errorMsg,
  });
  return { assessment: result.ok ? result.value : null, error: errorMsg };
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
      const { assessment, error } = await analyzeTab(id);
      return assessment ? { ok: true, data: assessment } : { ok: false, error: error ?? 'Analysis failed' };
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
      const language = assessment.assessment?.language ?? Language.fromOrDefault(settings.languageOverride ?? browser.i18n.getUILanguage()).tag;
      const hubReports = /^https?:/.test(req.origin) ? await hubClient.listReports(req.origin, language) : [];
      const state: PopupState = { assessment, settings, keys, hubReports };
      return { ok: true, data: state };
    }
    case 'getHubReport': {
      const result = await importHubReport.execute(req.id, req.origin, req.title);
      return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error.message };
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
      const prevSettings = await settingsRepo.load();
      const result = await saveSettings.execute(req.patch);
      if (result.ok && !prevSettings.shareAnalyses && result.value.shareAnalyses) {
        await syncToHub.execute();
      }
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

// On tab load: show score dot if already assessed; offer analysis prompt otherwise.
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (!/^https?:/.test(tab.url)) return;
  const settings = await settingsRepo.load();
  if (!settings.autoToast) return;
  const origin = new URL(tab.url).origin;
  const existing = await assessmentRepo.get(origin);
  if (existing && existing.status === 'ready') {
    const grade = existing.assessment?.grade ?? '?';
    void browser.action.setBadgeText({ text: grade, tabId });
    void browser.action.setBadgeBackgroundColor({ color: BADGE_GRADE_COLOR[grade] ?? '#6b7280', tabId });
    await sendToTab(tabId, { kind: 'showScore', assessment: existing });
    // Stale check: compare stored policy URLs with current page candidates
    try {
      const input = (await browser.tabs.sendMessage(tabId, { kind: 'collect' } as ContentCommand)) as AnalyzeSiteInput;
      const currentUrls = input.candidates.map((c) => c.url);
      if (policyUrlsChanged(existing.policyUrls ?? [], currentUrls)) {
        await sendToTab(tabId, { kind: 'stale', lastAnalysedAt: existing.updatedAt });
      }
    } catch {
      // content script may not respond (e.g. CSP restrictions)
    }
    return;
  }
  await sendToTab(tabId, { kind: 'prompt', hotkey: HOTKEY });
});

logger.log('info', 'Termsinator background ready');
