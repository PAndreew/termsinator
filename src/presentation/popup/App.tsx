import { useEffect, useMemo, useState } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { request, activeOrigin, uiLocale } from '../ui/api';
import { translatorFor } from '../i18n/messages';
import type { PopupState } from '../messaging';
import type { SiteAssessment } from '../../domain/entities/site-assessment';
import type { RiskBand } from '../../domain/value-objects/risk-score';
import { LEGAL_FRAMEWORKS } from '../../domain/value-objects/legal-framework';

const BAND_COLOR: Record<RiskBand, string> = {
  low: '#16a34a',
  moderate: '#ca8a04',
  high: '#ea580c',
  severe: '#dc2626',
};

export function App() {
  const [state, setState] = useState<PopupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [where, setWhere] = useState<{ origin: string; title: string }>({ origin: '', title: '' });

  const locale = uiLocale(state?.settings ?? null);
  const t = useMemo(() => translatorFor(locale), [locale]);

  useEffect(() => {
    void (async () => {
      const w = await activeOrigin();
      setWhere(w);
      if (w.origin) setState(await request<PopupState>({ kind: 'getPopupState', origin: w.origin, title: w.title }));
      else setState(await request<PopupState>({ kind: 'getPopupState', origin: 'about:blank', title: w.title }));
    })();
  }, []);

  async function analyze() {
    setBusy(true);
    try {
      const assessment = await request<SiteAssessment>({ kind: 'analyzeActiveTab' });
      setState((s) => (s ? { ...s, assessment } : s));
    } catch (e) {
      setState((s) =>
        s
          ? {
              ...s,
              assessment: { ...s.assessment, status: 'error', error: (e as Error).message },
            }
          : s,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div class="tz-loading">…</div>;

  const a = state.assessment.assessment;
  const hasKey = state.keys.length > 0;

  return (
    <div class="tz">
      <header class="tz-head">
        <div>
          <h1>{t('app.name')}</h1>
          <p class="tz-tagline">{t('app.tagline')}</p>
        </div>
        <button class="tz-link" onClick={() => void browser.runtime.openOptionsPage()}>
          {t('popup.openOptions')}
        </button>
      </header>

      <div class="tz-site">{where.title || where.origin}</div>

      {a && (
        <div class="tz-overall" style={{ background: BAND_COLOR[a.overall.band] }}>
          <span>{t('popup.overall')}</span>
          <strong>
            {t(`band.${a.overall.band}`)} · {a.overall.value}
          </strong>
        </div>
      )}

      <button class="tz-primary" disabled={busy} onClick={() => void analyze()}>
        {busy ? t('popup.analyzing') : t('popup.analyze')}
      </button>

      {state.assessment.status === 'error' && (
        <p class="tz-error">{t('popup.error', { error: state.assessment.error ?? '' })}</p>
      )}

      {!a && state.assessment.status !== 'error' && <p class="tz-muted">{t('popup.idle')}</p>}

      {a && (
        <>
          {a.summaryLines.length > 0 ? (
            <section>
              <h2>{t('popup.summary')}</h2>
              <ul class="tz-summary">
                {a.summaryLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          ) : (
            <p class="tz-muted">{t('popup.noKey')}</p>
          )}

          <section>
            <h2>{t('popup.frameworks')}</h2>
            <ul class="tz-frameworks">
              {LEGAL_FRAMEWORKS.map((f) => {
                const fs = a.frameworks.find((x) => x.framework === f);
                const band = fs?.score.band ?? 'low';
                return (
                  <li key={f}>
                    <span>{t(`framework.${f}`)}</span>
                    <span class="tz-pill" style={{ background: BAND_COLOR[band] }}>
                      {t(`band.${band}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {a.redFlags.length > 0 && (
            <section>
              <h2>{t('popup.redFlags')}</h2>
              <ul class="tz-flags">
                {a.redFlags.map((flag) => (
                  <li key={flag.id}>{t(flag.messageKey)}</li>
                ))}
              </ul>
            </section>
          )}

          <footer class="tz-foot">
            {a.provenance.mode === 'llm'
              ? t('popup.usingKey', { provider: a.provenance.provider ?? '' })
              : a.provenance.mode === 'hub'
                ? t('popup.fromHub', { provider: a.provenance.provider ?? 'unknown' })
                : t('popup.heuristic')}
          </footer>
        </>
      )}

      {!hasKey && a?.provenance.mode !== 'llm' && <div class="tz-hint">{t('popup.noKey')}</div>}
    </div>
  );
}
