/**
 * An individual unit. Every unit in the shop is a distinct roll
 * (type × affinities × rarity × quality); the type defs are the only "definitions".
 *
 * Units are plain serializable data. The same object is shown in the shop,
 * sits in your troop/bench, and is handed to the combat sim.
 */
import { CONFIG, RARITIES, type Rarity } from '../config'
import { TYPE_DEFS, type Stats, type UnitType } from './types'
import { primaryAffinity, rootsOf, type AffinityPoints } from '../affinities'
import type { Rng } from '../rng'
import type { Cost } from '../world/terrain'
import { unitName } from './names'

export interface Unit {
  uid: string
  name: string
  type: UnitType
  affinities: AffinityPoints
  rarity: Rarity
  /** Stat roll in [quality.min, quality.max]; research biases it upward. */
  quality: number
  level: number
  battlesSurvived: number
}

export interface UnitRoll {
  type: UnitType
  affinities: AffinityPoints
  rarity: Rarity
  quality: number
}

export function createUnit(uid: string, roll: UnitRoll, rng: Rng): Unit {
  return {
    uid,
    name: unitName(roll.type, roll.affinities, rng),
    ...roll,
    level: 1,
    battlesSurvived: 0,
  }
}

export const rarityIndex = (r: Rarity) => RARITIES.indexOf(r)

/** Stats from type × rarity × quality × level. Buildings and synergies are applied in combat. */
export function unitStats(u: Unit): Stats {
  const base = TYPE_DEFS[u.type].base
  const power = CONFIG.rarityStatMult[u.rarity] * u.quality * (1 + CONFIG.level.statPerLevel * (u.level - 1))
  return {
    ...base,
    hp: Math.round(base.hp * power),
    atk: Math.round(base.atk * power),
    def: Math.round(base.def * Math.sqrt(power)),
  }
}

/** Rough single-number strength, for sorting and AI drafting. */
export function unitPower(u: Unit): number {
  const s = unitStats(u)
  const dps = s.atk * s.atkSpeed
  const ehp = s.hp * (1 + s.def / 100)
  return Math.round(Math.sqrt(dps * ehp))
}

/** Morale to recruit: base by rarity, a little more for good quality rolls. */
export function recruitCost(u: Unit): number {
  return Math.max(1, Math.round(CONFIG.recruitMorale[u.rarity] * (0.85 + (u.quality - 1) * 2)))
}

export function upgradeDiscount(u: Unit): number {
  return Math.min(CONFIG.level.maxDiscount, u.battlesSurvived * CONFIG.level.discountPerBattleSurvived)
}

/** Null when the unit is at max level. `mult` carries species modifiers. */
/**
 * Gold and materials to raise a unit one level. Expensive on purpose, and
 * steeper the higher you go and the rarer the unit: a level-5 legendary is a
 * major investment, not a default. Null at max level. `mult` carries species
 * modifiers; veteran discounts apply to everything.
 */
export function upgradeCost(u: Unit, mult = 1): Cost | null {
  if (u.level >= CONFIG.level.max) return null
  const L = CONFIG.level
  const target = u.level + 1
  const scale = (1 - upgradeDiscount(u)) * mult
  const cost: Cost = { gold: Math.round(L.goldBase * (rarityIndex(u.rarity) + 1) * Math.pow(L.goldGrowth, u.level - 1) * scale) }
  // Training draws on the essences the unit's affinity grows from: a Magma knight needs fire and earth.
  // Plain citizens (no affinity) train on gold alone.
  const main = primaryAffinity(u.affinities)
  if (main && target >= L.essenceFrom) {
    const amount = Math.max(1, Math.round(L.essencePerLevel * (target - L.essenceFrom + 1) * scale))
    for (const r of rootsOf(main)) cost[r] = amount
  }
  return cost
}

/** Morale given back when you let a unit go. */
export function releaseRefund(u: Unit): number {
  return Math.floor(recruitCost(u) * CONFIG.releaseRefund)
}
