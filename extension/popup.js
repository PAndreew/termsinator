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
      const grade = letterGrade(summary.aggregate.score, summary.aggregate.grade, summary.aggregate.verdict);
      result.innerHTML = `<div class="quiet">${escapeHTML(hostname)}</div><div class="score grade-${grade?.toLowerCase() || 'na'}">${grade || 'Not graded'}</div><strong>${escapeHTML(summary.aggregate.verdict.replaceAll('_',' '))}</strong><p class="models">${summary.aggregate.model_count} model(s) · ${summary.consensus.polarized} polarized criteria</p>${risks}`;
      full.href = summary.full_report_url;
    }
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : 'Lookup failed';
  }
}

function letterGrade(score, grade, verdict) {
  if (verdict === 'insufficient_evidence' || score == null) return null;
  if (['A', 'B', 'C', 'D', 'E'].includes(grade)) return grade;
  if (score >= 85) return 'A'; if (score >= 70) return 'B'; if (score >= 50) return 'C'; if (score >= 30) return 'D'; return 'E';
}

function setDisclosure(automatic) {
  privacy.textContent = automatic ? 'Automatic: each visited hostname is sent; paths and page content are never sent.' : 'Click-only: no hostname is sent until you open this popup.';
}
function escapeHTML(value) {
  const span = document.createElement('span'); span.textContent = String(value); return span.innerHTML;
}
