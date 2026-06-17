import browser from 'webextension-polyfill';

import { LinkTextTermsDiscoverer } from '../../infrastructure/discovery/link-text-terms-discoverer';
import { DashboardKeyDetector } from '../../infrastructure/keys/dashboard-key-detector';
import type { AnchorLike, TermsLinkCandidate } from '../../domain/ports/content';
import type { TermsDocumentKind } from '../../domain/entities/terms-document';
import { Language } from '../../domain/value-objects/language';
import { translatorFor } from '../i18n/messages';
import type { AnalyzeSiteInput } from '../../application/analyze-site-terms';
import type { BgRequest, ContentCommand } from '../messaging';
import type { SiteAssessment } from '../../domain/entities/site-assessment';
import { showToast } from './toast';

const discoverer = new LinkTextTermsDiscoverer();
const keyDetector = new DashboardKeyDetector();
const t = translatorFor(Language.fromOrDefault(navigator.language).uiLocale);

function gatherAnchors(): AnchorLike[] {
  return Array.from(document.querySelectorAll('a[href]')).slice(0, 600).map((a) => ({
    href: a.getAttribute('href') ?? '',
    text: (a.textContent ?? '').slice(0, 120),
    rel: (a as HTMLAnchorElement).rel,
  }));
}

/** If the current page itself looks like a policy, analyse it directly too. */
function currentPageCandidate(): TermsLinkCandidate | null {
  const hay = `${location.pathname} ${document.title}`.toLowerCase();
  const kinds: [TermsDocumentKind, RegExp][] = [
    ['privacy', /privacy|datenschutz|privacidad|confidentialit|隐私/],
    ['terms', /terms|conditions|nutzungsbedingungen|t[eé]rminos|条款/],
  ];
  for (const [kind, re] of kinds) {
    if (re.test(hay)) {
      return { url: location.href, kind, label: document.title || kind, score: 0.95 };
    }
  }
  return null;
}

function collect(): AnalyzeSiteInput {
  const candidates = [...discoverer.discover(gatherAnchors(), location.href)];
  const own = currentPageCandidate();
  if (own && !candidates.some((c) => c.url === own.url)) candidates.unshift(own);
  return {
    origin: location.origin,
    title: document.title || location.host,
    candidates,
    navigatorLanguages: [...navigator.languages],
    documentLang: document.documentElement.lang || null,
  };
}

/** Harvest candidate key strings — only ever called on a provider dashboard. */
function collectKeySamples(): string[] {
  const samples: string[] = [];
  const push = (v: string | null | undefined): void => {
    if (v && v.length >= 8 && v.length <= 4000) samples.push(v);
  };
  document.querySelectorAll('input, textarea, code, pre').forEach((el) => {
    push((el as HTMLInputElement).value);
    push(el.textContent);
  });
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) push(localStorage.getItem(k));
    }
  } catch {
    // storage access can throw in sandboxed frames
  }
  return samples.slice(0, 200);
}

async function send(req: BgRequest): Promise<unknown> {
  return browser.runtime.sendMessage(req);
}

function summarize(assessment: SiteAssessment): string {
  const a = assessment.assessment;
  if (!a) return t('popup.idle');
  const band = t(`band.${a.overall.band}`);
  const line = a.summaryLines[0] ?? '';
  return `${t('popup.overall')}: ${band}. ${line}`.trim();
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const command = message as ContentCommand;
  switch (command.kind) {
    case 'collect':
      return Promise.resolve(collect());
    case 'result':
      if (command.ok && command.assessment) {
        showToast(summarize(command.assessment), command.assessment.assessment?.overall.band ?? 'low');
      } else {
        showToast(t('popup.error', { error: command.error ?? '' }), 'severe');
      }
      return undefined;
    case 'prompt':
      showToast(t('prompt.toast', { hotkey: command.hotkey }), 'info', () => void send({ kind: 'analyzeActiveTab' }));
      return undefined;
    case 'keyDetected':
      showToast(t('prompt.key', { provider: command.provider }), 'info');
      return undefined;
    default:
      return undefined;
  }
});

// On load: if this is a provider dashboard, attempt BYOK key detection.
if (keyDetector.isProviderHost(location.host)) {
  void send({ kind: 'detectKeys', input: { host: location.host, samples: collectKeySamples() } });
}
