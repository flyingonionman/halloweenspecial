/**
 * Every turn a fresh muster of citizens is called. Recruit them now (with
 * morale) or they're gone next turn.
 *
 * Two independent rolls make a citizen:
 *   rarity   — from population only; it sets the unit's strength
 *   affinity — from academies only. Citizens are born with none unless an
 *              academy gives them one (only ever one), and the academy's level
 *              caps how many points of it they can carry.
 */
import { CONFIG, RARITIES } from './config'
import { AFFINITIES, type Affinity, type AffinityPoints } from './affinities'
import type { AcademyLevel } from './world/city'
import { rarityOdds } from './population'
import { speciesMods, type SpeciesId } from './species'
import { UNIT_TYPES, isRanged } from './units/types'
import { createUnit, recruitCost, type Unit, type UnitRoll } from './units/unit'
import type { Rng } from './rng'

export interface Citizen {
  unit: Unit
  /** Morale to recruit. */
  price: number
}

export interface BirthContext {
  population: number
  species: SpeciesId | null
  /** Every dedicated academy. Without any, citizens are born with no affinity. */
  academies: readonly AcademyLevel[]
}

const academyWeight = (a: AcademyLevel) => CONFIG.affinity.birth.perLevel * a.level

/** Chance of each point count 1..level from an academy of `level`. */
export function pointOdds(level: number): number[] {
  const w = Array.from({ length: level }, (_, i) => Math.pow(CONFIG.affinity.birth.pointDecay, i))
  const total = w.reduce((s, x) => s + x, 0)
  return w.map((x) => x / total)
}

/** The affinity (and points) one citizen is born with, or null for none. */
export function rollAffinity(academies: readonly AcademyLevel[], rng: Rng): { affinity: Affinity; points: number } | null {
  const options: (AcademyLevel | null)[] = [null, ...academies]
  const pick = rng.weighted(options, (o) => (o ? academyWeight(o) : CONFIG.affinity.birth.none))
  if (!pick) return null
  const odds = pointOdds(pick.level)
  const points = rng.weighted(
    odds.map((_, i) => i + 1),
    (k) => odds[k - 1]!,
  )
  return { affinity: pick.affinity, points }
}

export function rollCitizen(ctx: BirthContext, rng: Rng): UnitRoll {
  const mods = speciesMods(ctx.species)
  const odds = rarityOdds(ctx.population, ctx.species)
  let ri = RARITIES.indexOf(rng.weighted(RARITIES, (r) => odds[r]))
  ri = Math.min(RARITIES.length - 1, ri + (mods.rarityShift ?? 0))
  const rarity = RARITIES[ri]!

  const type = rng.weighted(UNIT_TYPES, (t) => (isRanged(t) ? (mods.rangedWeightMult ?? 1) : 1))

  const born = rollAffinity(ctx.academies, rng)
  const affinities: AffinityPoints = born ? { [born.affinity]: born.points } : {}

  // Quality: best of two rolls for academy-taught citizens, so investment skews toward the top without guaranteeing it.
  const { min, max } = CONFIG.quality
  const level = born ? Math.max(...ctx.academies.filter((a) => a.affinity === born.affinity).map((a) => a.level)) : 0
  const bias = level * CONFIG.affinity.qualityBiasPerLevel
  let q = rng.next()
  if (bias > 0) q = Math.max(q, Math.min(1, rng.next() * (1 + bias)))
  const quality = Math.round((min + (max - min) * q) * 1000) / 1000

  return { type, affinities, rarity, quality }
}

export function birthCitizens(ctx: BirthContext, count: number, rng: Rng, makeUid: () => string): Citizen[] {
  return Array.from({ length: count }, () => {
    const unit = createUnit(makeUid(), rollCitizen(ctx, rng), rng)
    return { unit, price: recruitCost(unit) }
  })
}

/** How many citizens answer each muster. */
export const musterSize = (species: SpeciesId | null) => Math.round(CONFIG.muster.size * (speciesMods(species).birthsMult ?? 1))

export interface AffinityOdds {
  /** Chance a citizen is born with no affinity. */
  none: number
  /** Chance of each affinity, and of each point count given that affinity (index 0 = 1 point). */
  affinities: { affinity: Affinity; chance: number; points: number[] }[]
}

/** Birth odds for display, from your academies. */
export function affinityOdds(academies: readonly AcademyLevel[]): AffinityOdds {
  const total = CONFIG.affinity.birth.none + academies.reduce((s, a) => s + academyWeight(a), 0)
  const out: AffinityOdds['affinities'] = []
  for (const affinity of AFFINITIES) {
    const mine = academies.filter((a) => a.affinity === affinity)
    if (!mine.length) continue
    const weight = mine.reduce((s, a) => s + academyWeight(a), 0)
    const points = Array.from({ length: CONFIG.affinity.maxLevel }, () => 0)
    for (const a of mine) pointOdds(a.level).forEach((p, i) => (points[i]! += (p * academyWeight(a)) / weight))
    out.push({ affinity, chance: weight / total, points: points.slice(0, Math.max(...mine.map((a) => a.level))) })
  }
  return { none: CONFIG.affinity.birth.none / total, affinities: out.sort((x, y) => y.chance - x.chance) }
}
