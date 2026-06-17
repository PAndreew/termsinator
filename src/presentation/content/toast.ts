import type { RiskBand } from '../../domain/value-objects/risk-score';

type ToastTone = RiskBand | 'info';

const TONE_COLOR: Record<ToastTone, string> = {
  info: '#2563eb',
  low: '#16a34a',
  moderate: '#ca8a04',
  high: '#ea580c',
  severe: '#dc2626',
};

const HOST_ID = 'termsinator-toast-host';

/**
 * Renders a small, non-intrusive toast in an isolated shadow DOM (so page CSS
 * can't touch it). Auto-dismisses; optional click action lets the prompt toast
 * trigger analysis. Deliberately lightweight — no framework in the content
 * script — to keep the page footprint minimal.
 */
export function showToast(message: string, tone: ToastTone = 'info', onClick?: () => void): void {
  if (typeof document === 'undefined' || !document.body) return;

  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'position:fixed;bottom:16px;right:16px;z-index:2147483647;all:initial;';
  const root = host.attachShadow({ mode: 'open' });

  const card = document.createElement('div');
  card.setAttribute('role', 'status');
  card.style.cssText = [
    'font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'max-width:320px',
    'background:#fff',
    'color:#111',
    'border:1px solid #e5e7eb',
    `border-left:4px solid ${TONE_COLOR[tone]}`,
    'border-radius:10px',
    'box-shadow:0 8px 24px rgba(0,0,0,.16)',
    'padding:10px 12px',
    'cursor:default',
    'user-select:none',
  ].join(';');

  const brand = document.createElement('strong');
  brand.textContent = 'Termsinator';
  brand.style.cssText = `display:block;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${TONE_COLOR[tone]};margin-bottom:2px;`;

  const text = document.createElement('div');
  text.textContent = message;

  card.append(brand, text);

  if (onClick) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      onClick();
      host.remove();
    });
  }

  const close = document.createElement('button');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss');
  close.style.cssText =
    'position:absolute;top:4px;right:8px;border:0;background:transparent;font-size:16px;line-height:1;cursor:pointer;color:#9ca3af;';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    host.remove();
  });
  card.style.position = 'relative';
  card.appendChild(close);

  root.appendChild(card);
  document.body.appendChild(host);

  const ttl = onClick ? 12000 : 8000;
  setTimeout(() => host.remove(), ttl);
}
