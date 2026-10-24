/**
 * AI opponents: a simulated civ at the round's par population that commits to
 * one class + one element, drafts from its own shop, and levels its troop.
 */
import { CONFIG } from './config'
import { newCiv, type Civ } from './civ'
import { generateShop } from './shop'
import { CLASSES, ELEMENTS, isMelee } from './units/archetypes'
import { unitPower, type Unit } from './units/unit'
import type { Rng } from './rng'

export interface Opponent {
  name: string
  troop: Unit[]
}

const CIV_NAMES = ['The Hollow Reach', 'Candlemarch', 'Gravenholt', 'The Pumpkin Throne', 'Veilmoor', 'Bonefield', 'Ashwick', 'The Lantern League']

export function generateOpponent(round: number, rng: Rng, makeUid: () => string): Opponent {
  const o = CONFIG.opponent
  const focusCls = rng.pick(CLASSES)
  const focusEl = rng.pick(ELEMENTS)
  const bLevel = o.buildingLevelByRound[round] ?? CONFIG.buildings.maxLevel
  const civ: Civ = {
    ...newCiv(),
    population: o.populationByRound[round] ?? o.populationByRound.at(-1)!,
    buildings: { [`${focusCls}-hall`]: bLevel, [`${focusEl}-hall`]: bLevel },
  }

  const offers = generateShop(civ, rng, makeUid, 40)
  const score = (u: Unit) => unitPower(u) * (1 + (u.cls === focusCls ? 0.3 : 0) + (u.element === focusEl ? 0.3 : 0))
  const ranked = offers.map((of) => of.unit).sort((a, b) => score(b) - score(a))

  // Guarantee a front line of at least two melee units.
  const melee = ranked.filter((u) => isMelee(u.cls)).slice(0, 2)
  const rest = ranked.filter((u) => !melee.includes(u)).slice(0, CONFIG.troopSize - melee.length)
  const troop = [...melee, ...rest]

  const avgLevel = o.levelByRound[round] ?? 1
  for (const u of troop) {
    const frac = avgLevel - Math.floor(avgLevel)
    u.level = Math.min(CONFIG.level.max, Math.floor(avgLevel) + (rng.chance(frac) ? 1 : 0))
  }

  return { name: rng.pick(CIV_NAMES), troop }
}
