import type { LegalFramework } from '../value-objects/legal-framework';
import { RiskScore } from '../value-objects/risk-score';
import type { RedFlag } from '../value-objects/red-flag';
import { makeRedFlag } from '../value-objects/red-flag';
import type { Language } from '../value-objects/language';
import type { LlmAnalysis } from '../ports/analysis';
import type { RiskScoreSnapshot } from '../value-objects/risk-score';
import type {
  AnalysisProvenance,
  FrameworkScore,
  RiskAssessment,
} from '../entities/risk-assessment';

export interface AggregateInput {
  readonly redFlags: readonly RedFlag[];
  readonly llm: LlmAnalysis | null;
  readonly frameworks: readonly LegalFramework[];
  readonly language: Language;
  readonly provenance: AnalysisProvenance;
  readonly now: number;
}

/** How much LLM judgement counts vs deterministic flags when both exist. */
const LLM_WEIGHT = 0.6;
const HEURISTIC_WEIGHT = 0.4;

/**
 * Merges deterministic red flags with an optional LLM verdict into a single,
 * bounded RiskAssessment. Per-framework heuristic risk uses a saturating
 * "probabilistic OR" of flag weights so multiple concerns accumulate without
 * ever exceeding 100. Overall risk leans toward the worst framework but is
 * tempered by the mean so a single flag doesn't max everything out.
 */
export class ScoreAggregator {
  aggregate(input: AggregateInput): RiskAssessment {
    const redFlags = mergeFlags(input.redFlags, input.llm);

    const frameworks: FrameworkScore[] = input.frameworks.map((framework) => {
      const heuristic = saturate(redFlags.filter((f) => f.affects.includes(framework)).map((f) => f.weight));
      const verdict = input.llm?.frameworks.find((v) => v.framework === framework) ?? null;
      const value = verdict
        ? Math.round(LLM_WEIGHT * clamp01to100(verdict.score) + HEURISTIC_WEIGHT * heuristic)
        : heuristic;
      return {
        framework,
        score: RiskScore.clamp(value).snapshot(),
        rationale: verdict?.rationale ?? '',
      };
    });

    return {
      overall: overallScore(frameworks),
      frameworks,
      redFlags,
      summaryLines: input.llm ? input.llm.summaryLines.slice(0, 5) : [],
      language: input.language.tag,
      provenance: input.provenance,
      createdAt: input.now,
    };
  }
}

function mergeFlags(deterministic: readonly RedFlag[], llm: LlmAnalysis | null): RedFlag[] {
  const byId = new Map<string, RedFlag>();
  for (const f of deterministic) if (!byId.has(f.id)) byId.set(f.id, f);
  if (llm) {
    for (const f of llm.redFlags) {
      if (!byId.has(f.id)) {
        byId.set(f.id, makeRedFlag(f.id, f.messageKey, f.affects, f.weight, f.evidence));
      }
    }
  }
  return [...byId.values()];
}

/** Probabilistic OR of weights -> 0..100, rounded. Empty -> 0. */
function saturate(weights: readonly number[]): number {
  let safety = 1;
  for (const w of weights) safety *= 1 - clamp01to100(w) / 100;
  return Math.round(100 * (1 - safety));
}

function overallScore(frameworks: readonly FrameworkScore[]): RiskScoreSnapshot {
  if (frameworks.length === 0) return RiskScore.clamp(0).snapshot();
  const values = frameworks.map((f) => f.score.value);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return RiskScore.clamp(Math.round(0.6 * max + 0.4 * mean)).snapshot();
}

function clamp01to100(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}
