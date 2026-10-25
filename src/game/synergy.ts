/**
 * Synergy evaluation and final combat stats.
 *
 * A synergy's tier comes from troop affinity points; its strength is that tier's
 * values × the affinity-level multiplier from research. Compound synergies take
 * the lowest tier and lowest level of their components.
 */
import { CONFIG } from './config'
import { EFFECT_KEYS, SYNERGY_DEFS, type Affinity, type AffinityPoints, type EffectKey, type Effects, type SynergyDef } from './affinities'
import type { TeamBonuses } from './world/city'
import { TYPE_DEFS, type DamageKind, type Stats } from './units/types'
import { unitStats, type Unit } from './units/unit'

export interface ActiveSynergy {
  def: SynergyDef
  /** Troop points per component, in component order. */
  points: number[]
  /** 0 = inactive, 1–4 = active tier. */
  tier: number
  /** Affinity level 0–4 (lowest component for compounds). */
  level: number
  /** Points needed per component for the next tier, or null at max tier. */
  nextAt: number | null
  /** Effect values at the current tier × level (or tier 1 when inactive, for previews). */
  effects: Effects
}

export function troopAffinityPoints(troop: readonly Unit[]): AffinityPoints {
  const totals: AffinityPoints = {}
  for (const u of troop) for (const [a, n] of Object.entries(u.affinities) as [Affinity, number][]) totals[a] = (totals[a] ?? 0) + n
  return totals
}

export const tierFor = (points: number) => CONFIG.affinity.thresholds.filter((t) => points >= t).length

export function synergyEffects(def: SynergyDef, tier: number, level: number): Effects {
  const mult = CONFIG.affinity.levelMult[level] ?? 1
  const out: Effects = {}
  for (const [k, values] of Object.entries(def.tiers) as [EffectKey, readonly number[]][]) {
    out[k] = values[Math.max(0, tier - 1)]! * mult
  }
  return out
}

/** Every synergy the troop has at least one point toward (compounds need both components). */
export function computeSynergies(troop: readonly Unit[], levels: Partial<Record<Affinity, number>> = {}): ActiveSynergy[] {
  const totals = troopAffinityPoints(troop)
  const out: ActiveSynergy[] = []
  for (const def of SYNERGY_DEFS) {
    const points = def.components.map((a) => totals[a] ?? 0)
    if (points.some((p) => p === 0)) continue
    const tier = Math.min(...points.map(tierFor))
    const level = Math.min(...def.components.map((a) => levels[a] ?? 0))
    out.push({
      def,
      points,
      tier,
      level,
      nextAt: CONFIG.affinity.thresholds[tier] ?? null,
      effects: synergyEffects(def, tier, level),
    })
  }
  return out
}

export interface CombatStats extends Stats, Record<Exclude<EffectKey, `${string}Pct`>, number> {
  damage: DamageKind
  spellPower: number
  energyGain: number
}

/** Final stats: unit × military buildings × research level + attunement of its affinities × active synergies it carries. */
export function combatStats(unit: Unit, synergies: readonly ActiveSynergy[], bonuses?: TeamBonuses): CombatStats {
  const base = unitStats(unit)
  const fx: Record<EffectKey, number> = Object.fromEntries(EFFECT_KEYS.map((k) => [k, 0])) as Record<EffectKey, number>

  for (const syn of synergies) {
    if (syn.tier < 1 || !syn.def.components.some((a) => (unit.affinities[a] ?? 0) > 0)) continue
    for (const [k, v] of Object.entries(syn.effects) as [EffectKey, number][]) fx[k] += v
  }

  let researchMult = 1
  if (bonuses) {
    for (const a of Object.keys(unit.affinities) as Affinity[]) {
      researchMult +=
        (bonuses.affinityLevels[a] ?? 0) * CONFIG.affinity.combatBonusPerLevel +
        (bonuses.attune[a] ?? 0) * CONFIG.affinity.combatBonusPerAttune
    }
  }

  return {
    hp: Math.round(base.hp * (bonuses?.hpMult ?? 1) * researchMult * (1 + fx.hpPct)),
    atk: Math.round(base.atk * (bonuses?.atkMult ?? 1) * researchMult * (1 + fx.atkPct)),
    def: Math.round(base.def * (bonuses?.defMult ?? 1) * (1 + fx.defPct)),
    range: base.range,
    atkSpeed: base.atkSpeed * (1 + fx.atkSpeedPct),
    moveSpeed: base.moveSpeed * (1 + fx.moveSpeedPct),
    maxEnergy: base.maxEnergy,
    damage: TYPE_DEFS[unit.type].damage,
    spellPower: 1 + fx.spellPowerPct,
    energyGain: 1 + fx.energyGainPct,
    critChance: 0.05 + fx.critChance,
    damageReduction: Math.min(CONFIG.combat.maxDamageReduction, fx.damageReduction),
    bonusMagic: fx.bonusMagic,
    slowOnHit: Math.min(0.8, fx.slowOnHit),
    startShield: fx.startShield,
    thorns: fx.thorns,
    doubleStrike: Math.min(0.75, fx.doubleStrike),
    lifesteal: fx.lifesteal,
  }
}
