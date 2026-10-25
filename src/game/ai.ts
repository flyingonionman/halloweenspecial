/**
 * Opponents.
 *
 * Round opponents are *ghosts*: a snapshot of a civ's troop at a given round,
 * the same shape a real player's troop would be stored in for async PvP.
 * For now every ghost comes from `aiGhost`; a backend can implement
 * GhostSource later and nothing else changes.
 *
 * Camps are NPC troops on the map, raided during a turn.
 */
import { CONFIG, RARITIES } from './config'
import { AFFINITY_DEFS, affinitiesOfTier, rootsOf, type Affinity } from './affinities'
import { landOf } from './world/city'
import { birthCitizens } from './citizens'
import { isRanged } from './units/types'
import { unitPower, type Unit } from './units/unit'
import { TERRAIN_DEFS, type TerrainId } from './world/terrain'
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
  // Parents of the focus must be at least at the unlock level, or the focus couldn't exist.
  const levels = Object.fromEntries(
    spec.focus.map((a, i) => [a, i === 0 ? spec.research : Math.max(spec.research, AFFINITY_DEFS[spec.focus[0]!].tier > 1 ? CONFIG.affinity.unlockLevel : 0)]),
  ) as Partial<Record<Affinity, number>>
  // The academies such a civ would have built: two for its main affinity, one for each parent.
  const academies = spec.focus.flatMap((a, i) => {
    const academy = { affinity: a, level: Math.max(1, levels[a] ?? 0) }
    return i === 0 ? [academy, academy] : [academy]
  })
  const pool = birthCitizens(
    { population: spec.population, species: null, academies },
    Math.max(12, spec.size * 5),
    rng,
    makeUid,
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
      hpMult: 1 + spec.generic,
      atkMult: 1 + spec.generic,
      defMult: 1 + spec.generic / 2,
    },
  }
}

const atRound = <T>(arr: readonly T[], round: number) => arr[Math.min(round, arr.length - 1)]!

/** The land an affinity ultimately grows from: the first of its tier-1 roots that has land. */
function homeOf(a: Affinity): TerrainId {
  for (const r of rootsOf(a)) {
    const t = landOf(r)[0]
    if (t) return t
  }
  return 'plains'
}

export const aiGhosts: GhostSource = {
  find(round, rng, makeUid) {
    const o = CONFIG.opponent
    // Opponents climb the tree as the rounds go on: a target affinity plus the parents that unlock it.
    const target = rng.pick(affinitiesOfTier(atRound(o.targetTierByRound, round)))
    const focus: Affinity[] = [target, ...AFFINITY_DEFS[target].parents]
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
    return { name: rng.pick(CIV_NAMES), round, troop, bonuses, homeBiome: homeOf(target), focus, source: 'ai' }
  },
}

/** The troop defending a camp. Scales with camp strength and the current round. */
export function campTroop(camp: Camp, terrain: TerrainId, round: number, rng: Rng, makeUid: () => string): { troop: Unit[]; bonuses: TeamBonuses } {
  const c = CONFIG.camps
  const pop = atRound(CONFIG.opponent.populationByRound, round) * (c.populationMult[camp.strength] ?? 1)
  const local = TERRAIN_DEFS[terrain].affinity
  return generateTroop(
    {
      population: Math.max(CONFIG.rarityThresholds.common, pop),
      focus: local ? [local] : [rng.pick(affinitiesOfTier(1))],
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
