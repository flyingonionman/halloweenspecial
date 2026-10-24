/**
 * Layer 2 of the unit model: an individual unit. Every unit in the shop is a
 * distinct roll (class × element × rarity × quality), so there's no separate
 * "definition" per unit — the archetypes are the definitions.
 *
 * Units are plain serializable data. The same object is shown in the shop,
 * sits in your troop/bench, and is handed to the combat sim.
 */
import { CONFIG, RARITIES, type Rarity } from '../config'
import { CLASS_DEFS, ELEMENT_DEFS, type Element, type Stats, type Tag, type UnitClass } from './archetypes'
import type { Rng } from '../rng'
import { unitName } from './names'

export interface Unit {
  uid: string
  name: string
  cls: UnitClass
  element: Element
  rarity: Rarity
  /** Stat roll in [quality.min, quality.max]; buildings bias it upward. */
  quality: number
  level: number
  battlesSurvived: number
}

export interface UnitRoll {
  cls: UnitClass
  element: Element
  rarity: Rarity
  quality: number
}

export function createUnit(uid: string, roll: UnitRoll, rng: Rng): Unit {
  return {
    uid,
    name: unitName(roll.cls, roll.element, rng),
    ...roll,
    level: 1,
    battlesSurvived: 0,
  }
}

export const tagsOf = (u: Pick<Unit, 'cls' | 'element'>): Tag[] => [u.cls, u.element]

export const rarityIndex = (r: Rarity) => RARITIES.indexOf(r)

/** Final stats before synergies: archetype × element × rarity × quality × level. */
export function unitStats(u: Unit): Stats {
  const base = CLASS_DEFS[u.cls].base
  const passive = ELEMENT_DEFS[u.element].passive
  const power = CONFIG.rarityStatMult[u.rarity] * u.quality * (1 + CONFIG.level.statPerLevel * (u.level - 1))
  return {
    hp: Math.round(base.hp * power * (passive.hp ?? 1)),
    atk: Math.round(base.atk * power * (passive.atk ?? 1)),
    def: Math.round(base.def * Math.sqrt(power) * (passive.def ?? 1)),
    range: base.range * (passive.range ?? 1),
    atkSpeed: base.atkSpeed * (passive.atkSpeed ?? 1),
    moveSpeed: base.moveSpeed * (passive.moveSpeed ?? 1),
    maxEnergy: base.maxEnergy,
  }
}

/** Rough single-number strength, for sorting and AI drafting. */
export function unitPower(u: Unit): number {
  const s = unitStats(u)
  const dps = s.atk * s.atkSpeed
  const ehp = s.hp * (1 + s.def / 100)
  return Math.round(Math.sqrt(dps * ehp))
}

export function purchasePrice(u: Unit): number {
  return Math.max(1, Math.round(CONFIG.rarityPrice[u.rarity] * (0.85 + (u.quality - 1) * 2)))
}

export function upgradeDiscount(u: Unit): number {
  return Math.min(CONFIG.level.maxDiscount, u.battlesSurvived * CONFIG.level.discountPerBattleSurvived)
}

/** Null when the unit is at max level. */
export function upgradeCost(u: Unit): number | null {
  if (u.level >= CONFIG.level.max) return null
  const { costFactor, costGrowth } = CONFIG.level
  const raw = CONFIG.rarityPrice[u.rarity] * costFactor * Math.pow(costGrowth, u.level - 1)
  return Math.max(1, Math.round(raw * (1 - upgradeDiscount(u))))
}

export function releaseRefund(u: Unit): number {
  return Math.floor(purchasePrice(u) * CONFIG.releaseRefund)
}
