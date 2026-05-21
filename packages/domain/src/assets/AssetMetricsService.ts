import { DomainException } from '../errors/domain.exception.js'
import type { WorkOrder } from '../work-orders/WorkOrder.js'
import type { Money } from '../work-orders/value-objects/money.js'
import { CriticalityLevel } from './value-objects/criticality-level.js'

// ── Value types ───────────────────────────────────────────────────────────────

/**
 * A time duration expressed in both hours and days (fractional).
 *
 * `hours` is the canonical value; `days` is a convenience alias
 * (`hours / 24`) rounded to 4 decimal places.
 */
export interface Duration {
  readonly hours: number
  readonly days: number
}

/**
 * Qualitative impact / frequency levels used in the criticality risk matrix.
 *
 *  1 = Low   — negligible safety risk / minor production disruption / rare / cheap
 *  2 = Medium — moderate risk / significant disruption / occasional / moderate cost
 *  3 = High  — severe risk / critical disruption / frequent / expensive
 */
export type ImpactLevel = 1 | 2 | 3

/**
 * Input factors for the criticality risk-matrix calculation.
 * Each factor is scored 1 (Low) → 3 (High).
 */
export interface CriticalityFactors {
  /** Potential harm to personnel or environment if the asset fails. */
  readonly safetyImpact: ImpactLevel
  /** Effect on throughput / revenue if the asset is out of service. */
  readonly productionImpact: ImpactLevel
  /** How often the asset fails (historical frequency). */
  readonly failureFrequency: ImpactLevel
  /** Labour + parts cost to restore the asset to service. */
  readonly repairCost: ImpactLevel
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const MS_PER_HOUR = 1000 * 60 * 60

function msToHours(ms: number): number {
  return ms / MS_PER_HOUR
}

function makeDuration(hours: number): Duration {
  return {
    hours: Math.round(hours * 10_000) / 10_000,
    days: Math.round((hours / 24) * 10_000) / 10_000,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * AssetMetricsService — pure domain service for reliability & maintenance KPIs.
 *
 * All five methods are **side-effect free**: they receive data as parameters and
 * return a computed result.  No repository calls, no I/O.
 *
 * Terminology follows the IEC 60050-191 / ISO 14224 standards:
 *  • MTBF  — Mean Time Between Failures
 *  • MTTR  — Mean Time To Repair
 *  • Availability — steady-state operational availability
 */
export class AssetMetricsService {
  // ── MTBF ─────────────────────────────────────────────────────────────────────

  /**
   * Calculate Mean Time Between Failures.
   *
   * Algorithm:
   *  1. Keep only WOs that have a `completedAt` date (completed failures).
   *  2. Sort chronologically by `completedAt`.
   *  3. Compute each inter-failure interval: `completedAt[i+1] − completedAt[i]`.
   *  4. MTBF = sum(intervals) / (n − 1)
   *
   * Returns `{ hours: 0, days: 0 }` when there are fewer than 2 completed WOs
   * (insufficient data — not an error).
   *
   * @param completedRepairWOs Work orders that represent repair events (any type).
   */
  static calculateMTBF(completedRepairWOs: WorkOrder[]): Duration {
    const dated = completedRepairWOs
      .filter((wo) => wo.completedAt !== undefined)
      .map((wo) => wo.completedAt!.getTime()) // safe: filter guarantees defined
      .sort((a, b) => a - b)

    if (dated.length < 2) {
      return makeDuration(0)
    }

    let totalMs = 0
    for (let i = 1; i < dated.length; i += 1) {
      totalMs += dated[i]! - dated[i - 1]!
    }

    const avgMs = totalMs / (dated.length - 1)
    return makeDuration(msToHours(avgMs))
  }

  // ── MTTR ─────────────────────────────────────────────────────────────────────

  /**
   * Calculate Mean Time To Repair.
   *
   * Algorithm:
   *  1. Filter to **CORRECTIVE** work orders only (excludes PREVENTIVE, INSPECTION, EMERGENCY).
   *  2. Keep only WOs that have both `startedAt` and `completedAt`.
   *  3. Repair duration per WO = `completedAt − startedAt`.
   *  4. MTTR = sum(durations) / n
   *
   * Returns `{ hours: 0, days: 0 }` when no valid CORRECTIVE WOs are present.
   *
   * @param repairWOs All work orders for the asset (non-corrective types are excluded).
   */
  static calculateMTTR(repairWOs: WorkOrder[]): Duration {
    const durations = repairWOs
      .filter(
        (wo) =>
          wo.type === 'CORRECTIVE' && wo.startedAt !== undefined && wo.completedAt !== undefined,
      )
      // safe: filter guarantees both dates are defined
      .map((wo) => wo.completedAt!.getTime() - wo.startedAt!.getTime())

    if (durations.length === 0) {
      return makeDuration(0)
    }

    const totalMs = durations.reduce((sum, ms) => sum + ms, 0)

    return makeDuration(msToHours(totalMs / durations.length))
  }

  // ── Availability ──────────────────────────────────────────────────────────────

  /**
   * Calculate steady-state operational availability (%).
   *
   * Formula:
   *   A(%) = MTBF / (MTBF + MTTR) × 100
   *
   * When MTBF + MTTR = 0 (no historical data) the function returns 100 because
   * zero failures implies full availability.
   *
   * @param totalHours   Not used in the formula but retained for future
   *                     extensions (e.g. inherent vs operational availability).
   * @param mtbf         Result of `calculateMTBF`.
   * @param mttr         Result of `calculateMTTR`.
   * @returns            Percentage in the range [0, 100].
   */
  static calculateAvailability(_totalHours: number, mtbf: Duration, mttr: Duration): number {
    const sum = mtbf.hours + mttr.hours

    if (sum === 0) {
      return 100
    }

    const pct = (mtbf.hours / sum) * 100
    return Math.round(pct * 100) / 100 // round to 2 d.p.
  }

  // ── Maintenance cost ratio ────────────────────────────────────────────────────

  /**
   * Calculate the Maintenance Cost Ratio (MCR) as a percentage of asset value.
   *
   * Formula:
   *   MCR(%) = (annual maintenance cost / asset replacement value) × 100
   *
   * Industry benchmarks:
   *   < 2%  — Excellent (world-class asset management)
   *   2–5%  — Good (typical well-maintained plant)
   *   > 5%  — Poor (consider replacement or reliability programme)
   *
   * @throws DomainException(`ZERO_ASSET_VALUE`) when `assetValue` is zero —
   *         the denominator must be a positive monetary value.
   */
  static calculateMaintenanceCostRatio(totalCost: Money, assetValue: Money): number {
    if (assetValue.isZero()) {
      throw new DomainException(
        'Asset replacement value must be greater than zero to calculate the maintenance cost ratio',
        'ZERO_ASSET_VALUE',
      )
    }

    const ratio = totalCost.amount.div(assetValue.amount).mul(100).toNumber()
    return Math.round(ratio * 100) / 100 // round to 2 d.p.
  }

  // ── Criticality assessment ────────────────────────────────────────────────────

  /**
   * Determine the asset's criticality classification using a risk matrix.
   *
   * Scoring:
   *   Each of the four factors contributes 1–3 points → total 4–12.
   *
   *   Score 10–12 → A (Mission-critical)
   *   Score  7–9  → B (High-impact)
   *   Score  5–6  → C (Moderate-impact)
   *   Score  4    → D (Low-impact)
   *
   * The matrix is deliberately simple so asset managers can apply it without
   * specialist tooling.  More sophisticated models (FMEA, RCM) are application-layer
   * concerns.
   *
   * @param factors Four ImpactLevel scores (1 | 2 | 3).
   * @returns       The corresponding `CriticalityLevel` singleton.
   */
  static assessCriticality(factors: CriticalityFactors): CriticalityLevel {
    const score =
      factors.safetyImpact +
      factors.productionImpact +
      factors.failureFrequency +
      factors.repairCost

    if (score >= 10) return CriticalityLevel.A
    if (score >= 7) return CriticalityLevel.B
    if (score >= 5) return CriticalityLevel.C
    return CriticalityLevel.D
  }
}
