import { useEffect, useMemo, useState } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { request, activeOrigin, uiLocale } from '../ui/api';
import { translatorFor } from '../i18n/messages';
import type { PopupState } from '../messaging';
import type { SiteAssessment } from '../../domain/entities/site-assessment';
import type { RiskAssessment } from '../../domain/entities/risk-assessment';
import type { Grade } from '../../domain/value-objects/grade';
import { PRIVACY_ATTRIBUTE_BY_ID } from '../../domain/services/privacy-attribute-registry';

const GRADE_COLOR: Record<Grade, string> = { A: '#16a34a', B: '#4d7c0f', C: '#ca8a04', D: '#ea580c', F: '#dc2626' };

function Provenance({ assessment, t }: { assessment: RiskAssessment; t: (key: string, params?: Record<string, string | number>) => string }) {
  const provenance = assessment.provenance;
  const model = provenance.model ?? provenance.provider ?? '';
  if (provenance.mode === 'hub') return <span>{t('popup.fromHub', { provider: model })}</span>;
  if (provenance.mode === 'llm') return <span>{t('popup.usingKey', { provider: model })}</span>;
  return <span>{t('popup.heuristic')}</span>;
}

export function App() {
  const [state, setState] = useState<PopupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [where, setWhere] = useState({ origin: '', title: '' });
  const locale = uiLocale(state?.settings ?? null);
  const t = useMemo(() => translatorFor(locale), [locale]);

  useEffect(() => {
    void (async () => {
      const active = await activeOrigin();
      setWhere(active);
      setState(await request<PopupState>({ kind: 'getPopupState', origin: active.origin || 'about:blank', title: active.title }));
    })();
  }, []);

  async function analyze() {
    setBusy(true);
    try {
      const assessment = await request<SiteAssessment>({ kind: 'analyzeActiveTab' });
      setState((current) => current ? { ...current, assessment } : current);
    } catch (error) {
      setState((current) => current ? {
        ...current,
        assessment: { ...current.assessment, status: 'error', error: (error as Error).message },
      } : current);
    } finally {
      setBusy(false);
    }
  }

  async function selectReport(id: string) {
    if (!id) return;
    setBusy(true);
    try {
      const assessment = await request<SiteAssessment>({ kind: 'getHubReport', id: Number(id), origin: where.origin, title: where.title });
      setState((current) => current ? { ...current, assessment } : current);
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div class="tz-loading">...</div>;
  const assessment = state.assessment.assessment;

  return (
    <div class="tz">
      <header class="tz-head">
        <div><h1>{t('app.name')}</h1><p class="tz-tagline">{t('app.tagline')}</p></div>
        <button class="tz-link" onClick={() => void browser.runtime.openOptionsPage()}>{t('popup.openOptions')}</button>
      </header>
      <div class="tz-site">{where.title || where.origin}</div>

      {state.hubReports.length > 0 && (
        <label class="tz-field">
          <span>Community model report</span>
          <select disabled={busy} value="" onChange={(event) => void selectReport(event.currentTarget.value)}>
            <option value="">Select a model analysis...</option>
            {state.hubReports.map((report) => <option key={report.id} value={report.id}>
              {report.model ?? report.provider ?? 'Unknown model'} · {report.grade} · {report.score ?? '?'} risk · {Math.round(report.coverage * 100)}% coverage
            </option>)}
          </select>
        </label>
      )}

      {assessment && (
        <div class="tz-hero" style={{ background: assessment.grade ? GRADE_COLOR[assessment.grade] : '#4b5563' }}>
          <div class="tz-grade">{assessment.grade ?? '?'}</div>
          <div class="tz-hero-right">
            <strong>Policy grade</strong>
            <span>{assessment.score === null ? 'Insufficient verified evidence' : `${assessment.score}/100 risk · ${Math.round(assessment.coverage * 100)}% coverage · ${assessment.confidence} confidence`}</span>
          </div>
        </div>
      )}

      <button class="tz-primary" disabled={busy} onClick={() => void analyze()}>{busy ? t('popup.analyzing') : t('popup.analyze')}</button>
      {state.assessment.status === 'error' && <p class="tz-error">{t('popup.error', { error: state.assessment.error ?? '' })}</p>}
      {!assessment && state.assessment.status !== 'error' && <p class="tz-muted">{t('popup.idle')}</p>}

      {assessment && <>
        {assessment.summaryFacts.length > 0 && <section>
          <h2>{t('popup.summary')}</h2>
          <ul class="tz-summary">{assessment.summaryFacts.map((fact, index) => <li key={index}>{fact.text}</li>)}</ul>
        </section>}

        {assessment.classifications.some((item) => typeof item.state === 'number' && item.state >= 3) && <section>
          <h2>{t('popup.redFlags')}</h2>
          <ul class="tz-flags">
            {assessment.classifications.filter((item) => typeof item.state === 'number' && item.state >= 3).map((item) => <li key={item.attributeId}>
              <strong>{PRIVACY_ATTRIBUTE_BY_ID.get(item.attributeId)?.definition ?? item.attributeId}</strong>
              <small>Risk level {item.state}/4 · {item.rationale}</small>
              {item.evidenceRefs.map((ref) => {
                const evidence = assessment.evidence.find((value) => value.evidenceId === ref);
                return evidence ? <blockquote key={ref}>{evidence.quote}</blockquote> : null;
              })}
            </li>)}
          </ul>
        </section>}

        {assessment.actions.length > 0 && <section>
          <h2>{t('popup.actionPlan')}</h2>
          <ol class="tz-plan">{assessment.actions.map((action) => <li key={action.actionId}>
            <strong>{action.title}{action.destructive ? ' (destructive)' : ''}</strong>
            <small>{action.why}</small>
            <ul>{action.steps.map((step, index) => <li key={index}>{step}</li>)}</ul>
            {action.fallback && <small>Fallback: {action.fallback}</small>}
          </li>)}</ol>
        </section>}

        <section>
          <h2>Assessment coverage</h2>
          <ul class="tz-frameworks">
            <li><span>Known attributes</span><strong>{assessment.classifications.filter((item) => typeof item.state === 'number').length}</strong></li>
            <li><span>Unknown attributes</span><strong>{assessment.classifications.filter((item) => item.state === 'unknown').length}</strong></li>
            <li><span>Evidence excerpts</span><strong>{assessment.evidence.length}</strong></li>
          </ul>
        </section>
        <footer class="tz-foot"><Provenance assessment={assessment} t={t} /></footer>
      </>}

      {state.keys.length === 0 && assessment?.provenance.mode !== 'llm' && <div class="tz-hint">{t('popup.noKey')}</div>}
    </div>
  );
}
