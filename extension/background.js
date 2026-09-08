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
    const badge = summary ? verdictBadge(summary.aggregate?.verdict) : '—';
    await chrome.action.setBadgeText({ tabId, text: badge });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: summary ? '#20201d' : '#686861' });
  } catch {
    await chrome.action.setBadgeText({ tabId, text: '!' });
  }
});

function verdictBadge(verdict) {
  return ({ user_respecting: 'A', low_concern: 'B', caution: 'C', high_concern: 'D', severe_concern: 'F' })[verdict] || '?';
}
