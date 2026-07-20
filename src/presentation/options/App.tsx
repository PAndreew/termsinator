import { useEffect, useMemo, useState } from 'preact/hooks';
import { request, uiLocale } from '../ui/api';
import { translatorFor } from '../i18n/messages';
import type { PublicKey } from '../messaging';
import type { Settings } from '../../domain/entities/settings';
import { SUPPORTED_UI_LOCALES } from '../../domain/value-objects/language';
import {
  PROVIDER_IDS,
  type ProviderId,
  providerDisplayName,
} from '../../domain/value-objects/provider-id';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keys, setKeys] = useState<readonly PublicKey[]>([]);
  const [status, setStatus] = useState<string>('');
  const [newProvider, setNewProvider] = useState<ProviderId>('openai');
  const [newSecret, setNewSecret] = useState('');

  const locale = uiLocale(settings);
  const t = useMemo(() => translatorFor(locale), [locale]);

  useEffect(() => {
    void (async () => {
      setSettings(await request<Settings>({ kind: 'getSettings' }));
      setKeys(await request<PublicKey[]>({ kind: 'getKeys' }));
    })();
  }, []);

  if (!settings) return <div class="tz-loading">…</div>;

  function patch(p: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...p } : s));
  }

  async function save() {
    try {
      const saved = await request<Settings>({ kind: 'saveSettings', patch: settings! });
      setSettings(saved);
      setStatus(t('options.saved'));
    } catch (e) {
      setStatus(t('options.invalid', { error: (e as Error).message }));
    }
    setTimeout(() => setStatus(''), 2500);
  }

  async function addKey() {
    if (newSecret.trim().length < 8) return;
    const updated = await request<PublicKey[]>({ kind: 'addManualKey', provider: newProvider, secret: newSecret.trim() });
    setKeys(updated);
    setNewSecret('');
  }

  async function removeKey(id: string) {
    setKeys(await request<PublicKey[]>({ kind: 'removeKey', id }));
  }

  return (
    <div class="tz-opt">
      <h1>{t('options.title')}</h1>

      <label class="tz-field">
        <span>{t('options.language')}</span>
        <select
          value={settings.languageOverride ?? ''}
          onChange={(e) => patch({ languageOverride: (e.currentTarget.value || null) as string | null })}
        >
          <option value="">{t('options.languageAuto')}</option>
          {SUPPORTED_UI_LOCALES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <label class="tz-check">
        <input type="checkbox" checked={settings.autoToast} onChange={(e) => patch({ autoToast: e.currentTarget.checked })} />
        <span>{t('options.autoToast')}</span>
      </label>

      <label class="tz-check">
        <input
          type="checkbox"
          checked={settings.alwaysRefresh}
          onChange={(e) => patch({ alwaysRefresh: e.currentTarget.checked })}
        />
        <span>{t('options.alwaysRefresh')}</span>
      </label>

      <label class="tz-check">
        <input
          type="checkbox"
          checked={settings.shareAnalyses}
          onChange={(e) => patch({ shareAnalyses: e.currentTarget.checked })}
        />
        <span>{t('options.shareAnalyses')}</span>
      </label>
      {settings.shareAnalyses && (
        <div>
        <label class="tz-field">
          <span>{t('options.hubUrl')}</span>
          <input
            type="url"
            placeholder={t('options.hubUrlPlaceholder')}
            value={settings.hubUrl ?? ''}
            onInput={(e) => patch({ hubUrl: e.currentTarget.value.trim() || null })}
          />
          <small class="tz-muted">{t('options.shareAnalysesHint')}</small>
        </label>
        </div>
      )}

      <label class="tz-field">
        <span>{t('options.maxTokens')}</span>
        <input
          type="number"
          min={500}
          max={50000}
          step={500}
          value={settings.maxTokens}
          onInput={(e) => patch({ maxTokens: Number(e.currentTarget.value) })}
        />
      </label>

      <label class="tz-field">
        <span>{t('options.activeProvider')}</span>
        <select
          value={settings.activeProvider ?? ''}
          onChange={(e) => patch({ activeProvider: (e.currentTarget.value || null) as ProviderId | null })}
        >
          <option value="">{t('options.providerAuto')}</option>
          {PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {providerDisplayName(p)}
            </option>
          ))}
        </select>
      </label>

      <label class="tz-field">
        <span>{t('options.modelOverride')}</span>
        <input
          type="text"
          placeholder={t('options.modelOverridePlaceholder')}
          value={settings.modelOverride ?? ''}
          onInput={(e) => patch({ modelOverride: e.currentTarget.value.trim() || null })}
        />
      </label>

      <button class="tz-primary" onClick={() => void save()}>
        {t('options.save')}
      </button>
      {status && <span class="tz-status">{status}</span>}

      <h2>{t('options.keys')}</h2>
      {keys.length === 0 ? (
        <p class="tz-muted">{t('options.noKeys')}</p>
      ) : (
        <ul class="tz-keys">
          {keys.map((k) => (
            <li key={k.id}>
              <span>
                <strong>{providerDisplayName(k.provider)}</strong> <code>{k.masked}</code>
                <small> · {k.sourceHost}</small>
              </span>
              <button class="tz-link" onClick={() => void removeKey(k.id)}>
                {t('options.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div class="tz-addkey">
        <select value={newProvider} onChange={(e) => setNewProvider(e.currentTarget.value as ProviderId)}>
          {PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {providerDisplayName(p)}
            </option>
          ))}
        </select>
        <input
          type="password"
          placeholder={t('options.secret')}
          value={newSecret}
          onInput={(e) => setNewSecret(e.currentTarget.value)}
        />
        <button onClick={() => void addKey()}>{t('options.addKey')}</button>
      </div>
    </div>
  );
}
