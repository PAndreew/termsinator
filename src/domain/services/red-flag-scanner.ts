import type { LegalFramework } from '../value-objects/legal-framework';
import { type RedFlag, makeRedFlag } from '../value-objects/red-flag';

interface FlagPattern {
  readonly id: string;
  readonly messageKey: string;
  readonly affects: readonly LegalFramework[];
  readonly weight: number;
  readonly re: RegExp;
}

/**
 * Deterministic, dependency-free detector of well-known unfavourable clauses.
 * Works on the sanitised plain text and runs with or without an LLM, so the
 * extension still gives signal when no BYOK key is configured.
 *
 * Patterns are intentionally conservative (high-precision phrases) to keep
 * false positives low; the LLM pass adds recall and nuance.
 */
const PATTERNS: readonly FlagPattern[] = [
  {
    id: 'sells_personal_data',
    messageKey: 'flag.sells_personal_data',
    affects: ['ccpa', 'data_sharing', 'common_sense'],
    weight: 75,
    re: /\b(we\s+sell|sale of|sell(?:ing)?)\b[^.]{0,40}\b(personal|your)\b[^.]{0,20}\b(data|information)\b/i,
  },
  {
    id: 'vague_trusted_partners',
    messageKey: 'flag.vague_trusted_partners',
    affects: ['gdpr', 'data_sharing', 'common_sense'],
    weight: 35,
    re: /\b(trusted|select(?:ed)?|carefully chosen)\s+(partners|third[\s-]?parties)\b/i,
  },
  {
    id: 'broad_third_party_sharing',
    messageKey: 'flag.broad_third_party_sharing',
    affects: ['data_sharing', 'gdpr', 'ccpa'],
    weight: 45,
    re: /\bshare[^.]{0,60}\bwith\b[^.]{0,30}\bthird[\s-]?part(?:y|ies)\b/i,
  },
  {
    id: 'indefinite_retention',
    messageKey: 'flag.indefinite_retention',
    affects: ['data_retention', 'gdpr'],
    weight: 40,
    re: /\b(retain|keep|store)[^.]{0,40}\b(indefinitely|as long as (?:we|necessary|permitted)|forever)\b/i,
  },
  {
    id: 'forced_arbitration',
    messageKey: 'flag.forced_arbitration',
    affects: ['common_sense'],
    weight: 45,
    re: /\b(binding|mandatory)\s+arbitration\b/i,
  },
  {
    id: 'class_action_waiver',
    messageKey: 'flag.class_action_waiver',
    affects: ['common_sense'],
    weight: 40,
    re: /\bclass[\s-]?action\s+waiver\b|\bwaive[^.]{0,40}class[\s-]?action\b/i,
  },
  {
    id: 'unilateral_changes',
    messageKey: 'flag.unilateral_changes',
    affects: ['common_sense', 'gdpr'],
    weight: 30,
    re: /\b(we|the company)\s+may[^.]{0,40}\b(change|modify|update|amend)\b[^.]{0,40}\b(at any time|without notice)\b/i,
  },
  {
    id: 'train_on_user_data',
    messageKey: 'flag.train_on_user_data',
    affects: ['gdpr', 'data_sharing', 'common_sense'],
    weight: 45,
    re: /\b(train|improve)[^.]{0,40}\b(models?|ai|machine learning|algorithms?)\b/i,
  },
  {
    id: 'prechecked_consent',
    messageKey: 'flag.prechecked_consent',
    affects: ['gdpr'],
    weight: 40,
    re: /\b(pre[\s-]?(checked|ticked)|opt[\s-]?out)\b[^.]{0,30}\b(consent|box|agree)\b/i,
  },
  {
    id: 'biometric_data',
    messageKey: 'flag.biometric_data',
    affects: ['gdpr', 'ccpa'],
    weight: 35,
    re: /\bbiometric\b/i,
  },
  {
    id: 'sells_to_brokers',
    messageKey: 'flag.sells_to_brokers',
    affects: ['ccpa', 'data_sharing'],
    weight: 50,
    re: /\bdata\s+brokers?\b/i,
  },
];

/** Match indicating a CCPA "Do Not Sell or Share" mechanism is offered. */
const DO_NOT_SELL_RE = /\bdo not sell( or share)?( my)?( personal)?( information| data)?\b/i;

export class RedFlagScanner {
  scan(text: string): RedFlag[] {
    const flags: RedFlag[] = [];
    for (const p of PATTERNS) {
      const m = p.re.exec(text);
      if (m) {
        flags.push(makeRedFlag(p.id, p.messageKey, p.affects, p.weight, evidenceAround(text, m.index)));
      }
    }

    // CCPA-specific: mentions selling data but offers no opt-out mechanism.
    const mentionsSelling = flags.some((f) => f.id === 'sells_personal_data' || f.id === 'sells_to_brokers');
    if (mentionsSelling && !DO_NOT_SELL_RE.test(text)) {
      flags.push(
        makeRedFlag(
          'missing_do_not_sell',
          'flag.missing_do_not_sell',
          ['ccpa'],
          35,
          'No "Do Not Sell or Share" mechanism found',
        ),
      );
    }

    return flags;
  }
}

function evidenceAround(text: string, index: number, span = 120): string {
  const start = Math.max(0, index - 20);
  return text.slice(start, start + span).replace(/\s+/g, ' ').trim();
}
