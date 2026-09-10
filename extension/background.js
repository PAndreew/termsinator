import { fetchSummary, hostnameOnly } from './shared.js';

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== 'complete' || !tab.url) return;
  const { lookupMode = 'click' } = await chrome.storage.local.get('lookupMode');
  if (lookupMode !== 'automatic') return;
  const hostname = hostnameOnly(tab.url);
  if (!hostname) return;
  try {
    const summary = await fetchSummary(hostname);
    await chrome.storage.local.set({ [`summary:${hostname}`]: { value: summary, savedAt: Date.now() } });
    const grade = letterGrade(summary?.aggregate);
    await chrome.action.setBadgeText({ tabId, text: grade || (summary ? '?' : '') });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: gradeColor(grade) });
    if (summary) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: showTermsinatorOverlay,
        args: [{
          hostname,
          grade,
          verdict: summary.aggregate?.verdict,
          risks: (summary.top_risks || []).slice(0, 2).map(item => item.title),
          reportURL: summary.full_report_url,
        }],
      });
    }
  } catch {
    await chrome.action.setBadgeText({ tabId, text: '!' });
  }
});

function letterGrade(aggregate) {
  if (!aggregate || aggregate.verdict === 'insufficient_evidence' || aggregate.score == null) return null;
  if (['A', 'B', 'C', 'D', 'E'].includes(aggregate.grade)) return aggregate.grade;
  return aggregate.score >= 85 ? 'A' : aggregate.score >= 70 ? 'B' : aggregate.score >= 50 ? 'C' : aggregate.score >= 30 ? 'D' : 'E';
}

function gradeColor(grade) {
  return ({ A: '#176b32', B: '#07599c', C: '#765600', D: '#963d00', E: '#8b1e27' })[grade] || '#555555';
}

function showTermsinatorOverlay(result) {
  const id = '__termsinator_overlay';
  document.getElementById(id)?.remove();
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(320px,calc(100vw - 32px));color:#111;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  const shadow = host.attachShadow({ mode: 'closed' });
  const gradeClass = result.grade ? `g-${result.grade.toLowerCase()}` : 'g-na';
  const risks = result.risks.map(risk => `<div class="risk">${escapeText(risk)}</div>`).join('');
  shadow.innerHTML = `<style>*{box-sizing:border-box}.card{background:#fff;border:1px solid #999;box-shadow:0 3px 14px #0002;padding:12px;font:13px/1.4 system-ui,sans-serif}.head{display:flex;align-items:center;gap:8px}.head strong{flex:1;font-size:14px}button{border:0;background:transparent;color:#333;font-size:19px;cursor:pointer}.grade{display:inline-block;margin:9px 8px 8px 0;padding:2px 7px;border:1px solid currentColor;font-size:24px;font-weight:750}.g-a{color:#176b32;background:#e1f3e5}.g-b{color:#07599c;background:#e2f0ff}.g-c{color:#765600;background:#fff3cd}.g-d{color:#963d00;background:#ffe4cf}.g-e{color:#8b1e27;background:#f8dadd}.g-na{color:#555;background:#eee;font-size:14px}.verdict{font-weight:650}.risk{border-top:1px solid #ddd;padding:6px 0}a{color:#0645ad}</style><div class="card"><div class="head"><strong>Termsinator · ${escapeText(result.hostname)}</strong><button aria-label="Close" title="Close">×</button></div><div><span class="grade ${gradeClass}">${result.grade || 'Not graded'}</span><span class="verdict">${escapeText(String(result.verdict || '').replaceAll('_', ' '))}</span></div>${risks}<a href="${safeReportURL(result.reportURL)}" target="_blank" rel="noreferrer">Open analysis</a></div>`;
  shadow.querySelector('button').addEventListener('click', () => host.remove());
  document.documentElement.append(host);

  function escapeText(value) {
    const node = document.createElement('span');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  }
  function safeReportURL(value) {
    try {
      const url = new URL(value);
      return url.origin === 'https://termsinator.46-62-240-211.sslip.io' ? url.href.replaceAll('&', '&amp;').replaceAll('"', '%22').replaceAll('<', '%3C') : 'https://termsinator.46-62-240-211.sslip.io/';
    } catch {
      return 'https://termsinator.46-62-240-211.sslip.io/';
    }
  }
}
