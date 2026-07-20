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
  const line = a.summaryFacts[0]?.text ?? '';
  return `Policy grade ${a.grade ?? 'unknown'}. ${line}`.trim();
}

const GRADE_COLOR: Record<string, string> = { A: '#16a34a', B: '#4d7c0f', C: '#ca8a04', D: '#ea580c', F: '#dc2626' };
const DOT_ID = 'tz-score-dot';

function injectDot(innerHtml: string, onClick: () => void, onDismiss: () => void): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.getElementById(DOT_ID)?.remove();
  const host = document.createElement('div');
  host.id = DOT_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = innerHtml;
  shadow.querySelector('.x')?.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(); });
  shadow.querySelector('.dot')?.addEventListener('click', onClick);
  document.documentElement.appendChild(host);
}

const DOT_BASE_CSS = `
  .wrap{position:fixed;bottom:24px;right:24px;z-index:2147483647}
  .dot{width:40px;height:40px;border-radius:50%;color:#fff;font:700 13px/40px system-ui,sans-serif;
    text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);user-select:none;
    transition:transform .15s;position:relative}
  .dot:hover{transform:scale(1.12)}
  .x{position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;
    background:rgba(0,0,0,.45);color:#fff;font:700 11px/16px system-ui;text-align:center;cursor:pointer;line-height:16px}
`;

function showAnalyzingDot(): void {
  injectDot(
    `<style>${DOT_BASE_CSS}
    @keyframes tz-pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .dot{background:#6366f1;animation:tz-pulse 1.4s ease-in-out infinite}
    </style>
    <div class="wrap"><div class="dot" title="Termsinator: analysing…">…<div class="x">×</div></div></div>`,
    () => {/* click on analysing dot does nothing */},
    () => document.getElementById(DOT_ID)?.remove(),
  );
}

function showScoreDot(assessment: SiteAssessment): void {
  const a = assessment.assessment;
  if (!a) return;
  const color = a.grade ? GRADE_COLOR[a.grade] : '#6b7280';
  injectDot(
    `<style>${DOT_BASE_CSS}</style>
    <div class="wrap">
      <div class="dot" style="background:${color}" title="Termsinator policy grade ${a.grade ?? 'unknown'}">
        ${a.grade ?? '?'}<div class="x">×</div>
      </div>
    </div>`,
    () => showToast(summarize(assessment), a.grade ?? undefined, undefined),
    () => document.getElementById(DOT_ID)?.remove(),
  );
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const command = message as ContentCommand;
  switch (command.kind) {
    case 'collect':
      return Promise.resolve(collect());
    case 'result':
      if (command.ok && command.assessment) {
        const grade = command.assessment.assessment?.grade ?? undefined;
        showToast(summarize(command.assessment), grade);
        showScoreDot(command.assessment);
      } else {
        showToast(t('popup.error', { error: command.error ?? '' }), 'F');
      }
      return undefined;
    case 'prompt':
      showToast(t('prompt.toast', { hotkey: command.hotkey }), 'info', () => void send({ kind: 'analyzeActiveTab' }));
      return undefined;
    case 'keyDetected':
      showToast(t('prompt.key', { provider: command.provider }), 'info');
      return undefined;
    case 'analyzing':
      showAnalyzingDot();
      return undefined;
    case 'showScore':
      showScoreDot(command.assessment);
      return undefined;
    case 'stale': {
      const date = new Date(command.lastAnalysedAt).toLocaleDateString();
      showToast(t('prompt.stale', { date }), 'info', () => void send({ kind: 'analyzeActiveTab' }));
      return undefined;
    }
    default:
      return undefined;
  }
});

// On load: if this is a provider dashboard, attempt BYOK key detection.
if (keyDetector.isProviderHost(location.host)) {
  void send({ kind: 'detectKeys', input: { host: location.host, samples: collectKeySamples() } });
}
