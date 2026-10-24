/**
 * The shop: every era it rerolls into `CONFIG.shopSize` distinct units, drawn
 * from a distribution shaped by population (rarity) and buildings (tags,
 * quality, rarity bumps).
 */
import { CONFIG, RARITIES, type Rarity } from './config'
import { rarityOdds, tagBuildingLevel, type Civ } from './civ'
import { CLASSES, ELEMENTS, type Tag } from './units/archetypes'
import { createUnit, purchasePrice, type Unit, type UnitRoll } from './units/unit'
import type { Rng } from './rng'

export interface Offer {
  unit: Unit
  price: number
}

const tagWeight = (civ: Civ, tag: Tag) => 1 + tagBuildingLevel(civ, tag) * CONFIG.buildings.tagWeightPerLevel

export function rollUnit(civ: Civ, rng: Rng): UnitRoll {
  const odds = rarityOdds(civ.population)
  let rarity = rng.weighted(RARITIES, (r) => odds[r])
  const cls = rng.weighted(CLASSES, (c) => tagWeight(civ, c))
  const element = rng.weighted(ELEMENTS, (e) => tagWeight(civ, e))

  const investment = tagBuildingLevel(civ, cls) + tagBuildingLevel(civ, element)

  // Buildings matching this unit's tags can bump it one rarity, if that rarity is unlocked.
  const next = RARITIES[RARITIES.indexOf(rarity) + 1] as Rarity | undefined
  if (next && odds[next] > 0 && rng.chance(investment * CONFIG.buildings.rarityBumpPerLevel)) rarity = next

  // Quality: best of (1 + bias) rolls, so investment skews toward the top without guaranteeing it.
  const { min, max } = CONFIG.quality
  const bias = investment * CONFIG.buildings.qualityBiasPerLevel
  let q = rng.next()
  q = Math.max(q, bias > 0 ? Math.min(1, rng.next() * (1 + bias)) : 0)
  const quality = Math.round((min + (max - min) * q) * 1000) / 1000

  return { cls, element, rarity, quality }
}

export function generateShop(civ: Civ, rng: Rng, makeUid: () => string, size: number = CONFIG.shopSize): Offer[] {
  const seen = new Set<string>()
  const offers: Offer[] = []
  let guard = 0
  while (offers.length < size && guard++ < size * 20) {
    const roll = rollUnit(civ, rng)
    const key = `${roll.cls}|${roll.element}|${roll.rarity}|${roll.quality}`
    if (seen.has(key)) continue
    seen.add(key)
    const unit = createUnit(makeUid(), roll, rng)
    offers.push({ unit, price: purchasePrice(unit) })
  }
  return offers
}
