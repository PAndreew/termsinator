export const API_BASE = 'https://termsinator.46-62-240-211.sslip.io/api/v1';

export function hostnameOnly(rawURL) {
  try {
    const url = new URL(rawURL);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export async function fetchSummary(hostname) {
  const response = await fetch(`${API_BASE}/sites/${encodeURIComponent(hostname)}/summary`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Termsinator is unavailable');
  return response.json();
}
