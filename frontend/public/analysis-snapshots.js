function escapeHTML(value) {
  const node = document.createElement('span');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

function label(value) {
  return String(value || '').replaceAll('_', ' ');
}

function gradeFor(score, explicitGrade, verdict) {
  if (verdict === 'insufficient_evidence' || score == null) return null;
  if (['A', 'B', 'C', 'D', 'E'].includes(explicitGrade)) return explicitGrade;
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 30) return 'D';
  return 'E';
}

function gradeBadge(grade, extraClass = '') {
  return grade
    ? `<span class="grade grade-${grade.toLowerCase()} ${extraClass}" aria-label="Grade ${grade}">${grade}</span>`
    : `<span class="grade grade-na ${extraClass}">Not graded</span>`;
}

function sourceLink(url, text = 'Source') {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `<a href="${escapeHTML(parsed.href)}" target="_blank" rel="noreferrer">${escapeHTML(text)}</a>`;
  } catch {
    return '';
  }
}

function snapshot(summary) {
  const classification = summary.classification || {};
  const aggregate = summary.aggregate || {};
  const sourceDate = summary.policy_revision?.source_date
    ? new Date(summary.policy_revision.source_date).toLocaleDateString()
    : 'Unknown date';
  const grade = gradeFor(aggregate.score, aggregate.grade, aggregate.verdict);
  const firstRisk = summary.top_risks?.[0]?.title;
  return `<details class="analysis" data-hostname="${encodeURIComponent(String(summary.hostname || ''))}">
    <summary class="analysis-summary">
      <strong>${escapeHTML(summary.hostname)}</strong>
      ${gradeBadge(grade, 'score')}
      <span>${escapeHTML(label(aggregate.verdict || 'insufficient_evidence'))}</span>
      <span>${escapeHTML(label(classification.subcategory || classification.offering_type || 'unclassified'))}</span>
      <span>${escapeHTML(sourceDate)}</span>
      ${firstRisk ? `<span class="snapshot-risk"><strong>Review first:</strong> ${escapeHTML(firstRisk)}</span>` : ''}
    </summary>
    <div class="analysis-report" aria-live="polite">Open to load the full analysis.</div>
  </details>`;
}

const CATEGORY_INFO = {
  DCP: ['Privacy and data collection', 'What information is collected, why it is needed, and whether sensitive data is limited.'],
  SST: ['Sharing, tracking and advertising', 'Who receives personal information and what control users have over tracking or targeted advertising.'],
  RSR: ['Retention, security and data rights', 'How long information is kept, how it is protected, and whether users can access or delete it.'],
  CIA: ['Content ownership and AI use', 'Who owns user content, what licenses are granted, and whether content can train AI systems.'],
  CTA: ['Account control and policy changes', 'How terms can change, when accounts can be suspended, and whether users can leave with their data.'],
  PRL: ['Payments, refunds and liability', 'Renewals, cancellation, refunds, warranties, liability limits, and indemnity obligations.'],
  DGT: ['Disputes and legal rights', 'Arbitration, class-action waivers, governing law, courts, and complaint routes.'],
  TAV: ['Clarity, accessibility and vulnerable users', 'Whether policies are understandable, dated, accessible, and protective of children or other vulnerable users.'],
};

function citationHTML(citation, documents) {
  const document = documents.get(citation.document_id);
  return `<blockquote>${escapeHTML(citation.quote || '')}<cite>${document ? sourceLink(document.url, document.title || document.kind || 'Source') : ''}</cite></blockquote>`;
}

function reportHTML(report, summary) {
  const documents = new Map((report.documents || []).map(document => [document.id, document]));
  const categories = report.score?.categories || [];
  const assessments = report.assessments || [];
  const flags = report.critical_flags || [];
  const actions = report.actions || [];
  const limitations = report.limitations || [];
  const evaluations = summary?.evaluations || [];
  const consensus = summary?.consensus || {};

  const evaluationRows = evaluations.map(evaluation => `<tr>
    <td>${escapeHTML(evaluation.model || 'Unknown model')}</td>
    <td>${gradeBadge(gradeFor(evaluation.score, evaluation.grade, evaluation.verdict))}</td>
    <td>${escapeHTML(label(evaluation.verdict || 'insufficient_evidence'))}</td>
    <td>${Math.round(Number(evaluation.coverage || 0) * 100)}%</td>
  </tr>`).join('');

  const categorySections = [...categories]
    .sort((left, right) => (left.score ?? -1) - (right.score ?? -1))
    .map(category => {
      const [name, description] = CATEGORY_INFO[category.category_id] || [category.category_id, 'Policy practices in this area.'];
      const categoryAssessments = assessments
        .filter(item => item.category_id === category.category_id)
        .sort((left, right) => (left.score ?? 5) - (right.score ?? 5));
      const criteria = categoryAssessments.map(item => {
        const citations = (item.citations || []).map(citation => citationHTML(citation, documents)).join('');
        const criterionGrade = item.score == null ? null : ['E', 'D', 'C', 'B', 'A'][item.score];
        return `<details class="criterion">
          <summary>${gradeBadge(criterionGrade)} <strong>${escapeHTML(item.summary || 'Finding')}</strong> <span class="criterion-code">${escapeHTML(item.criterion_id)}</span></summary>
          <p class="muted">${escapeHTML(label(item.evidence_status))}${item.reasoning && item.reasoning !== item.summary ? ` · ${escapeHTML(item.reasoning)}` : ''}</p>
          ${citations || '<p class="muted">No supporting citation.</p>'}
        </details>`;
      }).join('');
      return `<details class="category">
        <summary>${gradeBadge(gradeFor(category.score, category.grade, category.score == null ? 'insufficient_evidence' : ''))}
          <span><strong>${escapeHTML(name)}</strong><small>${Math.round(Number(category.coverage || 0) * 100)}% evidence coverage</small></span>
        </summary>
        <p>${escapeHTML(description)}</p>
        <div class="criteria">${criteria}</div>
      </details>`;
    }).join('');

  const flagSections = flags.map(flag => `<li><strong>${escapeHTML(label(flag.code))}</strong>: ${escapeHTML(flag.explanation || '')}${(flag.citations || []).map(citation => citationHTML(citation, documents)).join('')}</li>`).join('');
  const actionSections = actions.map(action => `<li><strong>${escapeHTML(action.title)}</strong>${(action.steps || []).length ? `<ol>${action.steps.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol>` : ''}</li>`).join('');
  const documentSections = [...documents.values()].map(document => `<li>${sourceLink(document.url, document.title || document.kind)} <span class="muted">(${escapeHTML(label(document.kind))})</span></li>`).join('');

  return `<div class="report-overview">
      <h3>${escapeHTML(report.verdict?.headline || label(report.verdict?.label || 'Analysis'))}</h3>
      <p>${escapeHTML(report.verdict?.rationale || '')}</p>
      <p class="meta"><span>${escapeHTML(report.agent?.model?.name || 'Unknown model')}</span><span>${Math.round(Number(report.score?.coverage || 0) * 100)}% evidence coverage</span></p>
    </div>
    ${flags.length ? `<h3>Critical findings</h3><ul class="report-list">${flagSections}</ul>` : '<h3>Critical findings</h3><p>None identified.</p>'}
    <h3>Areas to review first</h3>
    <p class="muted">Lowest grades and missing evidence appear first. Open an area, then a finding, for the cited policy text.</p>
    <div class="category-list">${categorySections}</div>
    ${evaluations.length ? `<h3>Model evaluations</h3>
      <table><thead><tr><th>Model</th><th>Grade</th><th>Verdict</th><th>Evidence</th></tr></thead><tbody>${evaluationRows}</tbody></table>
      <p class="muted">Grade range: ${gradeFor(consensus.score_min) || '—'}–${gradeFor(consensus.score_max) || '—'}; polarized criteria: ${consensus.polarized ?? 0}; applicability disagreements: ${consensus.applicability_disagreements ?? 0}.</p>` : ''}
    ${actions.length ? `<h3>Suggested actions</h3><ul class="report-list">${actionSections}</ul>` : ''}
    ${limitations.length ? `<h3>Limitations</h3><ul>${limitations.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : ''}
    <h3>Policy documents</h3><ul>${documentSections}</ul>`;
}

async function loadReport(details, summary) {
  if (details.dataset.loaded === 'true' || details.dataset.loading === 'true') return;
  details.dataset.loading = 'true';
  const target = details.querySelector('.analysis-report');
  if (!target) return;
  target.textContent = 'Loading full analysis…';
  try {
    const response = await fetch(`/api/v1/sites/${details.dataset.hostname}/report`);
    if (!response.ok) throw new Error(response.status === 404 ? 'Full analysis is not available.' : 'Could not load full analysis.');
    target.innerHTML = reportHTML(await response.json(), summary);
    details.dataset.loaded = 'true';
  } catch (error) {
    target.textContent = error instanceof Error ? error.message : 'Could not load full analysis.';
  } finally {
    delete details.dataset.loading;
  }
}

export function renderAnalyses(target, results) {
  if (!results.length) {
    target.innerHTML = '<p>No completed analyses yet.</p>';
    return;
  }
  target.innerHTML = results.map(snapshot).join('');
  target.querySelectorAll('details.analysis').forEach((details, index) => {
    details.addEventListener('toggle', () => {
      if (details.open) loadReport(details, results[index]);
    });
  });
}
