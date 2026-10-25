/**
 * Citizens are born every turn into the muster, shaped by your land and
 * research. They wait a few turns to be recruited, then move on.
 */
import { CONFIG, RARITIES } from './config'
import { AFFINITIES, type Affinity, type AffinityPoints } from './affinities'
import { rarityOdds } from './population'
import { speciesMods, type SpeciesId } from './species'
import { UNIT_TYPES, isRanged } from './units/types'
import { createUnit, recruitCost, type Unit, type UnitRoll } from './units/unit'
import type { Rng } from './rng'

export interface Citizen {
  unit: Unit
  /** Morale to recruit. */
  price: number
  /** Absolute turn index after which this citizen leaves the muster. */
  leavesAfter: number
}

export interface BirthContext {
  population: number
  species: SpeciesId | null
  /** Relative chance of each affinity (see affinityBirthWeights). */
  affinityWeights: Record<Affinity, number>
  /** Academy levels, for quality bias. */
  affinityLevels: Partial<Record<Affinity, number>>
}

export function rollCitizen(ctx: BirthContext, rng: Rng): UnitRoll {
  const mods = speciesMods(ctx.species)
  const odds = rarityOdds(ctx.population, ctx.species)
  let ri = RARITIES.indexOf(rng.weighted(RARITIES, (r) => odds[r]))
  ri = Math.min(RARITIES.length - 1, ri + (mods.rarityShift ?? 0))
  const rarity = RARITIES[ri]!

  const type = rng.weighted(UNIT_TYPES, (t) => (isRanged(t) ? (mods.rangedWeightMult ?? 1) : 1))

  const total = CONFIG.affinity.pointsByRarity[rarity]
  const weight = (a: Affinity) => ctx.affinityWeights[a]
  const first = rng.weighted(AFFINITIES, weight)
  const affinities: AffinityPoints = {}
  if (total >= 2 && rng.chance(CONFIG.affinity.dualChance)) {
    const second = rng.weighted(
      AFFINITIES.filter((a) => a !== first),
      weight,
    )
    const split = rng.int(1, total - 1)
    affinities[first] = total - split
    affinities[second] = split
  } else {
    affinities[first] = total
  }

  // Quality: best of two rolls when researched, so investment skews toward the top without guaranteeing it.
  const { min, max } = CONFIG.quality
  const research = (Object.keys(affinities) as Affinity[]).reduce((sum, a) => sum + (ctx.affinityLevels[a] ?? 0), 0)
  const bias = research * CONFIG.affinity.qualityBiasPerLevel
  let q = rng.next()
  if (bias > 0) q = Math.max(q, Math.min(1, rng.next() * (1 + bias)))
  const quality = Math.round((min + (max - min) * q) * 1000) / 1000

  return { type, affinities, rarity, quality }
}

export function birthCitizens(ctx: BirthContext, count: number, rng: Rng, makeUid: () => string, leavesAfter: number): Citizen[] {
  return Array.from({ length: count }, () => {
    const unit = createUnit(makeUid(), rollCitizen(ctx, rng), rng)
    return { unit, price: recruitCost(unit), leavesAfter }
  })
}

/** Citizens born each turn: grows by one per order of magnitude of population. */
export function birthsPerTurn(population: number, species: SpeciesId | null): number {
  const b = CONFIG.muster.births
  const base = b.base + b.perOrder * Math.max(0, Math.floor(Math.log10(population / CONFIG.start.population)))
  return Math.round(base * (speciesMods(species).birthsMult ?? 1))
}

/** Normalized affinity odds for display. */
export function affinityOdds(weights: Record<Affinity, number>): Record<Affinity, number> {
  const total = AFFINITIES.reduce((s, a) => s + weights[a], 0)
  return Object.fromEntries(AFFINITIES.map((a) => [a, weights[a] / total])) as Record<Affinity, number>
}
