import { type Result, ok, err } from '../../shared/result';

/**
 * Risk on a 0..100 scale where 0 is "nothing concerning" and 100 is "severe".
 * Bands give the UI a stable, colour-codable summary independent of exact value.
 */
export type RiskBand = 'low' | 'moderate' | 'high' | 'severe';

/**
 * Plain, serialisable form of a score (value + precomputed band). Entities hold
 * snapshots — not RiskScore instances — so they survive JSON persistence and
 * structured-clone messaging without losing the band derivation.
 */
export interface RiskScoreSnapshot {
  readonly value: number;
  readonly band: RiskBand;
}

export class RiskScore {
  private constructor(public readonly value: number) {}

  static of(value: number): Result<RiskScore, Error> {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return err(new Error(`Risk score must be within 0..100, got ${value}`));
    }
    return ok(new RiskScore(Math.round(value)));
  }

  /** Clamp instead of failing — handy when aggregating weighted contributions. */
  static clamp(value: number): RiskScore {
    if (Number.isNaN(value)) return new RiskScore(0);
    // ±Infinity saturate naturally to 100 / 0 via min/max.
    return new RiskScore(Math.round(Math.min(100, Math.max(0, value))));
  }

  get band(): RiskBand {
    if (this.value < 25) return 'low';
    if (this.value < 50) return 'moderate';
    if (this.value < 75) return 'high';
    return 'severe';
  }

  isWorseThan(other: RiskScore): boolean {
    return this.value > other.value;
  }

  snapshot(): RiskScoreSnapshot {
    return { value: this.value, band: this.band };
  }
}
