import browser from 'webextension-polyfill';
import type { Notifier, ToastRequest } from '../../domain/ports/platform';

/**
 * Non-intrusive notification via the extension notifications API. Failures are
 * swallowed (notifications are best-effort and must never break analysis).
 */
export class BrowserNotifier implements Notifier {
  async toast(request: ToastRequest): Promise<void> {
    try {
      await browser.notifications.create(`termsinator:${request.origin}`, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/icon-48.png'),
        title: request.title,
        message: request.message,
      });
    } catch {
      // best-effort only
    }
  }
}
