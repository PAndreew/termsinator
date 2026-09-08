import { API_BASE, fetchSummary, hostnameOnly } from './shared.js';

const toggle = document.querySelector('#automatic');
const privacy = document.querySelector('#privacy');
const result = document.querySelector('#result');
const full = document.querySelector('#full');
const { lookupMode = 'click' } = await chrome.storage.local.get('lookupMode');
toggle.checked = lookupMode === 'automatic';
setDisclosure(toggle.checked);

toggle.addEventListener('change', async () => {
  if (toggle.checked) {
    const granted = await chrome.permissions.request({ permissions: ['tabs'], origins: ['http://*/*', 'https://*/*'] });
    if (!granted) { toggle.checked = false; return; }
    await chrome.storage.local.set({ lookupMode: 'automatic' });
  } else {
    await chrome.storage.local.set({ lookupMode: 'click' });
    await chrome.permissions.remove({ permissions: ['tabs'], origins: ['http://*/*', 'https://*/*'] });
  }
  setDisclosure(toggle.checked);
});

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const hostname = hostnameOnly(tab?.url || '');
if (!hostname) {
  result.textContent = 'This page cannot be analyzed.';
} else {
  try {
    const summary = await fetchSummary(hostname);
    if (!summary) {
      result.innerHTML = `<strong>No report yet for ${escapeHTML(hostname)}</strong><p><a target="_blank" href="https://termsinator.46-62-240-211.sslip.io/?url=${encodeURIComponent(tab.url)}">Request analysis →</a></p>`;
    } else {
      const risks = (summary.top_risks || []).map(r => `<div class="risk">${escapeHTML(r.title)}</div>`).join('');
      result.innerHTML = `<div class="quiet">${escapeHTML(hostname)}</div><div class="score">${summary.aggregate.score ?? '—'}</div><strong>${escapeHTML(summary.aggregate.verdict.replaceAll('_',' '))}</strong><p class="models">${summary.aggregate.model_count} model(s) · ${summary.consensus.polarized} polarized criteria</p>${risks}`;
      full.href = summary.full_report_url;
    }
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : 'Lookup failed';
  }
}

function setDisclosure(automatic) {
  privacy.textContent = automatic ? 'Automatic: each visited hostname is sent; paths and page content are never sent.' : 'Click-only: no hostname is sent until you open this popup.';
}
function escapeHTML(value) {
  const span = document.createElement('span'); span.textContent = String(value); return span.innerHTML;
}
