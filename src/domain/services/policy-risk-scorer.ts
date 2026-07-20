import type { PolicyClassification, PolicyScoreResult } from '../entities/policy-analysis';
import type { Grade } from '../value-objects/grade';
import {
  PRIVACY_ATTRIBUTES,
  PRIVACY_ATTRIBUTE_BY_ID,
  type PrivacyAttributeId,
} from './privacy-attribute-registry';

export class PolicyRiskScorer {
  score(classifications: readonly PolicyClassification[]): PolicyScoreResult {
    const byId = new Map(classifications.map((item) => [item.attributeId, item]));
    let knownWeight = 0;
    let unknownWeight = 0;
    let weightedRisk = 0;
    let directWeight = 0;
    let criticalUnknowns = 0;
    let hasConflict = false;

    for (const attribute of PRIVACY_ATTRIBUTES) {
      const classification = byId.get(attribute.id);
      if (!classification || classification.state === 'unknown') {
        unknownWeight += attribute.weight;
        if (attribute.critical) criticalUnknowns++;
        continue;
      }
      if (classification.state === 'not_applicable') continue;
      knownWeight += attribute.weight;
      weightedRisk += attribute.weight * classification.state;
      if (classification.confidence === 'direct') directWeight += attribute.weight;
      if (classification.conflict) hasConflict = true;
    }

    const applicableWeight = knownWeight + unknownWeight;
    const coverage = applicableWeight === 0 ? 0 : knownWeight / applicableWeight;
    if (knownWeight === 0) {
      return {
        practiceRisk: null,
        finalRisk: null,
        coverage,
        grade: null,
        confidence: 'low',
        triggeredRules: ['grade.insufficient_known_attributes'],
      };
    }

    const practiceRisk = Math.round(25 * weightedRisk / knownWeight);
    const triggeredRules: string[] = [];
    let minimum = 0;

    if (criticalUnknowns === 1) {
      minimum = Math.max(minimum, 15);
      triggeredRules.push('disclosure.one_critical_unknown');
    }
    if (criticalUnknowns >= 2) {
      minimum = Math.max(minimum, 30);
      triggeredRules.push('disclosure.multiple_critical_unknowns');
    }
    if (coverage < 0.5) {
      minimum = Math.max(minimum, 50);
      triggeredRules.push('disclosure.coverage_below_50');
    } else if (coverage < 0.75) {
      minimum = Math.max(minimum, 30);
      triggeredRules.push('disclosure.coverage_below_75');
    }

    const severe = severeMinimum(byId);
    minimum = Math.max(minimum, severe.minimum);
    triggeredRules.push(...severe.rules);

    const finalRisk = Math.max(practiceRisk, minimum);
    const directRatio = knownWeight === 0 ? 0 : directWeight / knownWeight;
    const confidence =
      coverage >= 0.9 && directRatio >= 0.9 && !hasConflict
        ? 'high'
        : coverage >= 0.75 && directRatio >= 0.7
          ? 'moderate'
          : 'low';

    return {
      practiceRisk,
      finalRisk,
      coverage,
      grade: gradeFor(finalRisk),
      confidence,
      triggeredRules,
    };
  }
}

function numericState(
  values: ReadonlyMap<PrivacyAttributeId, PolicyClassification>,
  id: PrivacyAttributeId,
): number {
  const state = values.get(id)?.state;
  return typeof state === 'number' ? state : -1;
}

function severeMinimum(
  values: ReadonlyMap<PrivacyAttributeId, PolicyClassification>,
): { minimum: number; rules: string[] } {
  let minimum = 0;
  const rules: string[] = [];
  const state = (id: PrivacyAttributeId) => numericState(values, id);
  const sensitive = Math.max(
    state('data.sensitive_traits'),
    state('data.precise_location'),
    state('data.communications_and_content'),
    state('data.children'),
  );
  const commercial = Math.max(
    state('purpose.advertising'),
    state('sharing.adtech_and_analytics'),
    state('sharing.sale_or_commercial_transfer'),
    state('tracking.sensitive_targeting'),
  );
  if (sensitive >= 3 && commercial >= 3) {
    minimum = 70;
    rules.push('severe.sensitive_commercial_use');
  }
  if (state('sharing.sale_or_commercial_transfer') === 4 && sensitive >= 3) {
    minimum = 70;
    rules.push('severe.sale_of_critical_data');
  }
  const dRules: Array<[boolean, string]> = [
    [state('purpose.open_ended_future_use') === 4, 'severe.open_ended_future_use'],
    [state('sharing.onward_transfer_control') === 4, 'severe.uncontrolled_onward_transfer'],
    [state('retention.period_specificity') === 4 && state('retention.necessity') >= 3, 'severe.indefinite_unnecessary_retention'],
    [state('control.consent_and_defaults') === 4, 'severe.compulsory_or_bundled_consent'],
    [state('control.core_service_choice') === 4, 'severe.no_core_service_choice'],
    [state('tracking.cross_context') >= 3 && state('control.consent_and_defaults') >= 3, 'severe.default_cross_context_tracking'],
  ];
  for (const [matched, rule] of dRules) {
    if (!matched) continue;
    minimum = Math.max(minimum, 50);
    rules.push(rule);
  }
  return { minimum, rules };
}

function gradeFor(score: number): Grade {
  if (score < 15) return 'A';
  if (score < 30) return 'B';
  if (score < 50) return 'C';
  if (score < 70) return 'D';
  return 'F';
}

export function privacyAttributeWeight(id: PrivacyAttributeId): number {
  return PRIVACY_ATTRIBUTE_BY_ID.get(id)?.weight ?? 0;
}
