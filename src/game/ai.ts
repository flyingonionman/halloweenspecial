/**
 * Opponents.
 *
 * Round opponents are *ghosts*: a snapshot of a civ's troop at a given round,
 * the same shape a real player's troop would be stored in for async PvP.
 * For now every ghost comes from `aiGhost`; a backend can implement
 * GhostSource later and nothing else changes.
 *
 * Camps are NPC troops on the map, fought during a turn as a deed.
 */
import { CONFIG, RARITIES } from './config'
import { AFFINITIES, COMPOUND_SYNERGIES, type Affinity } from './affinities'
import { birthCitizens } from './citizens'
import { isRanged } from './units/types'
import { unitPower, type Unit } from './units/unit'
import { AFFINITY_TERRAIN, type TerrainId } from './world/terrain'
import type { TeamBonuses } from './world/city'
import type { Camp } from './world/map'
import type { Rng } from './rng'

export interface GhostSnapshot {
  name: string
  round: number
  troop: Unit[]
  bonuses: TeamBonuses
  homeBiome: TerrainId
  focus: Affinity[]
  source: 'ai' | 'player'
}

export interface GhostSource {
  find(round: number, rng: Rng, makeUid: () => string): GhostSnapshot
}

const CIV_NAMES = ['The Hollow Reach', 'Candlemarch', 'Gravenholt', 'The Pumpkin Throne', 'Veilmoor', 'Bonefield', 'Ashwick', 'The Lantern League']

interface TroopSpec {
  population: number
  focus: Affinity[]
  research: number
  generic: number
  size: number
  level: number
}

function generateTroop(spec: TroopSpec, rng: Rng, makeUid: () => string): { troop: Unit[]; bonuses: TeamBonuses } {
  const levels = Object.fromEntries(spec.focus.map((a) => [a, spec.research])) as Partial<Record<Affinity, number>>
  const weights = Object.fromEntries(AFFINITIES.map((a) => [a, 1 + (spec.focus.includes(a) ? 4 + 4 * spec.research : 0)])) as Record<Affinity, number>
  const pool = birthCitizens(
    { population: spec.population, species: null, affinityWeights: weights, affinityLevels: levels },
    Math.max(12, spec.size * 5),
    rng,
    makeUid,
    0,
  ).map((c) => c.unit)

  const score = (u: Unit) => unitPower(u) * (1 + 0.15 * spec.focus.reduce((s, a) => s + (u.affinities[a] ?? 0), 0))
  const ranked = pool.sort((a, b) => score(b) - score(a))
  const melee = ranked.filter((u) => !isRanged(u.type)).slice(0, Math.min(2, spec.size))
  const rest = ranked.filter((u) => !melee.includes(u)).slice(0, spec.size - melee.length)
  const troop = [...melee, ...rest]

  const frac = spec.level - Math.floor(spec.level)
  for (const u of troop) u.level = Math.min(CONFIG.level.max, Math.floor(spec.level) + (rng.chance(frac) ? 1 : 0))

  return {
    troop,
    bonuses: {
      affinityLevels: levels,
      attune: Object.fromEntries(spec.focus.map((a) => [a, Math.min(3, spec.research)])),
      hpMult: 1 + spec.generic,
      atkMult: 1 + spec.generic,
      defMult: 1 + spec.generic / 2,
    },
  }
}

const atRound = <T>(arr: readonly T[], round: number) => arr[Math.min(round, arr.length - 1)]!

export const aiGhosts: GhostSource = {
  find(round, rng, makeUid) {
    const o = CONFIG.opponent
    const focus: Affinity[] = rng.chance(0.6)
      ? [...rng.pick(COMPOUND_SYNERGIES).components]
      : [rng.pick(AFFINITIES), rng.pick(AFFINITIES)].filter((a, i, arr) => arr.indexOf(a) === i)
    const { troop, bonuses } = generateTroop(
      {
        population: atRound(o.populationByRound, round),
        focus,
        research: atRound(o.researchByRound, round),
        generic: atRound(o.genericByRound, round),
        size: CONFIG.troopSize,
        level: atRound(o.levelByRound, round),
      },
      rng,
      makeUid,
    )
    return { name: rng.pick(CIV_NAMES), round, troop, bonuses, homeBiome: AFFINITY_TERRAIN[focus[0]!], focus, source: 'ai' }
  },
}

/** The troop defending a camp. Scales with camp strength and the current round. */
export function campTroop(camp: Camp, terrain: TerrainId, round: number, rng: Rng, makeUid: () => string): { troop: Unit[]; bonuses: TeamBonuses } {
  const c = CONFIG.camps
  const pop = atRound(CONFIG.opponent.populationByRound, round) * (c.populationMult[camp.strength] ?? 1)
  const local = (Object.entries(AFFINITY_TERRAIN) as [Affinity, TerrainId][]).find(([, t]) => t === terrain)?.[0]
  return generateTroop(
    {
      population: Math.max(CONFIG.rarityThresholds.common, pop),
      focus: local ? [local] : [rng.pick(AFFINITIES)],
      research: 0,
      generic: 0,
      size: c.sizeByStrength[camp.strength] ?? 2,
      level: 1 + Math.floor(round / 2),
    },
    rng,
    makeUid,
  )
}

export const campRarityHint = (camp: Camp, round: number) => {
  const pop = atRound(CONFIG.opponent.populationByRound, round) * (CONFIG.camps.populationMult[camp.strength] ?? 1)
  return RARITIES.filter((r) => pop >= CONFIG.rarityThresholds[r]).at(-1)!
}
