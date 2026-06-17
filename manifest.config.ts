/**
 * Single source of truth for the MV3 manifest.
 *
 * vite-plugin-web-extension consumes the object returned here and discovers all
 * entry points (background, content scripts, popup/options HTML) from it. We branch
 * on the build target because Firefox does not support `background.service_worker`
 * and requires an explicit add-on id.
 */
export type BuildTarget = 'chrome' | 'firefox';

const PERMISSIONS = ['storage', 'activeTab', 'scripting', 'notifications', 'clipboardRead'];

export function generateManifest(target: BuildTarget): Record<string, unknown> {
  const base: Record<string, unknown> = {
    manifest_version: 3,
    name: 'Termsinator',
    version: '0.1.0',
    description:
      "Finds, analyses and explains any site's terms & privacy policy in plain language. BYOK, private, non-intrusive.",
    // No default_locale: Termsinator localises in-app (see src/presentation/i18n),
    // not via chrome.i18n, so requiring a _locales/ bundle would only block loading.
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    permissions: PERMISSIONS,
    host_permissions: ['<all_urls>'],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['src/presentation/content/content-script.ts'],
        run_at: 'document_idle',
      },
    ],
    action: {
      default_popup: 'src/presentation/popup/index.html',
      default_title: 'Termsinator',
    },
    options_ui: {
      page: 'src/presentation/options/index.html',
      open_in_tab: true,
    },
    commands: {
      'analyze-site': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: "Analyze this site's terms & privacy policy",
      },
    },
  };

  if (target === 'firefox') {
    base.background = { scripts: ['src/presentation/background/service-worker.ts'], type: 'module' };
    base.browser_specific_settings = {
      gecko: { id: 'termsinator@local', strict_min_version: '121.0' },
    };
  } else {
    base.background = {
      service_worker: 'src/presentation/background/service-worker.ts',
      type: 'module',
    };
  }

  return base;
}
