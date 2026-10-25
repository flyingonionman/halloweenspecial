/**
 * Buildings sit on tiles. Each one has a base output and adjacency rules: its
 * output grows with the right terrain or buildings next to it. That's the
 * spatial puzzle: where you put things matters as much as what you build.
 *
 * Kinds:
 *   extractor — turns a terrain into its resource (replaces the tile's raw yield)
 *   civic     — food, gold, trade
 *   military  — permanent combat bonuses for every unit (the tempo line)
 *   research  — one academy per affinity; its level is that affinity's level
 */
import { AFFINITIES, AFFINITY_LABEL, type Affinity } from '../affinities'
import { AFFINITY_RESOURCE, AFFINITY_TERRAIN, TERRAIN_DEFS, type Cost, type ResourceId, type TerrainId } from './terrain'

export type OutputKey = ResourceId | 'atkPct' | 'hpPct' | 'defPct' | 'trade' | 'attune'
export type Outputs = Partial<Record<OutputKey, number>>

const EXTRACTORS = [
  ['lumber-camp', 'Lumber Camp', 'forest'],
  ['mine', 'Mine', 'hills'],
  ['quarry', 'Quarry', 'mountains'],
  ['tannery', 'Tannery', 'steppe'],
  ['ice-pit', 'Ice Pit', 'tundra'],
  ['ember-pit', 'Ember Pit', 'volcanic'],
  ['crystal-drill', 'Crystal Drill', 'leyfield'],
  ['aerie', 'Aerie', 'highlands'],
] as const

type ExtractorId = (typeof EXTRACTORS)[number][0]
export type AcademyId = `${Affinity}-academy`
export type BuildingId = 'capital' | 'farm' | 'market' | 'trading-post' | 'barracks' | 'walls' | 'armory' | ExtractorId | AcademyId

export type BuildingKind = 'capital' | 'extractor' | 'civic' | 'military' | 'research'

export type Selector = { terrain: TerrainId } | { building: BuildingId } | { sameTerrain: true }

export interface AdjacencyRule {
  per: Selector
  add: Outputs
  /** Max neighbours counted. */
  cap?: number
}

export interface BuildingDef {
  id: BuildingId
  name: string
  kind: BuildingKind
  text: string
  /** Terrains it can be placed on; 'any' = any buildable terrain. */
  allowed: readonly TerrainId[] | 'any'
  unique?: boolean
  maxLevel: number
  /** Cost to reach `level` (1 = initial build). */
  cost: (level: number) => Cost
  base: Outputs
  adjacency: AdjacencyRule[]
  affinity?: Affinity
}

const flat = (c: Cost) => () => c

const RESEARCH_NAMES: Record<Affinity, string> = {
  sword: 'Sword School',
  shield: 'Shieldwright Hall',
  bow: 'Archery Range',
  arcane: 'Arcane Library',
  fire: 'Fire Mage’s Academy',
  frost: 'Frost Spire',
  wind: 'Wind Tower',
  earth: 'Stone Circle',
}

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  capital: {
    id: 'capital',
    name: 'Capital',
    kind: 'capital',
    text: 'The heart of your civilization.',
    allowed: [],
    unique: true,
    maxLevel: 1,
    cost: flat({}),
    base: { food: 2, gold: 4 },
    adjacency: [],
  },
  farm: {
    id: 'farm',
    name: 'Farm',
    kind: 'civic',
    text: 'Food feeds growth.',
    allowed: ['plains'],
    maxLevel: 1,
    cost: flat({ gold: 3 }),
    base: { food: 2 },
    adjacency: [
      { per: { terrain: 'lake' }, add: { food: 1 }, cap: 2 },
      { per: { building: 'farm' }, add: { food: 1 }, cap: 2 },
    ],
  },
  market: {
    id: 'market',
    name: 'Market',
    kind: 'civic',
    text: 'Gold every turn. Sells the harvest of neighbouring farms.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 5, timber: 2 }),
    base: { gold: 2 },
    adjacency: [
      { per: { building: 'farm' }, add: { gold: 1 }, cap: 3 },
      { per: { building: 'capital' }, add: { gold: 1 }, cap: 1 },
    ],
  },
  'trading-post': {
    id: 'trading-post',
    name: 'Trading Post',
    kind: 'civic',
    text: 'Lets you trade materials. Better rates beside a lake or market.',
    allowed: 'any',
    unique: true,
    maxLevel: 1,
    // Gold only: it's the escape hatch for whatever your land lacks.
    cost: flat({ gold: 8 }),
    base: { trade: 0 },
    adjacency: [
      { per: { terrain: 'lake' }, add: { trade: 1 }, cap: 1 },
      { per: { building: 'market' }, add: { trade: 1 }, cap: 1 },
    ],
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    kind: 'military',
    text: 'Every unit hits harder. Feeds on nearby mines.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 5, iron: 3 }),
    base: { atkPct: 0.08 },
    adjacency: [{ per: { building: 'mine' }, add: { atkPct: 0.03 }, cap: 3 }],
  },
  walls: {
    id: 'walls',
    name: 'Walls',
    kind: 'military',
    text: 'Every unit is hardier. Feeds on nearby quarries and mountains.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 5, stone: 3 }),
    base: { hpPct: 0.08 },
    adjacency: [
      { per: { building: 'quarry' }, add: { hpPct: 0.03 }, cap: 2 },
      { per: { terrain: 'mountains' }, add: { hpPct: 0.01 }, cap: 3 },
    ],
  },
  armory: {
    id: 'armory',
    name: 'Armory',
    kind: 'military',
    text: 'Every unit is better armoured. Best between barracks and walls.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 6, iron: 2, hide: 2 }),
    base: { defPct: 0.08 },
    adjacency: [
      { per: { building: 'barracks' }, add: { defPct: 0.04 }, cap: 2 },
      { per: { building: 'walls' }, add: { defPct: 0.04 }, cap: 2 },
    ],
  },
  ...(Object.fromEntries(
    EXTRACTORS.map(([id, name, terrain]): [ExtractorId, BuildingDef] => {
      const res = TERRAIN_DEFS[terrain].resource
      const label = TERRAIN_DEFS[terrain].label.toLowerCase()
      return [
        id,
        {
          id,
          name,
          kind: 'extractor',
          text: `Works ${label} for ${res}. +1 per neighbouring ${label} tile.`,
          allowed: [terrain],
          maxLevel: 1,
          cost: flat(id === 'lumber-camp' ? { gold: 3 } : { gold: 3, timber: 1 }),
          base: { [res]: 2 },
          adjacency: [{ per: { sameTerrain: true }, add: { [res]: 1 }, cap: 3 }],
        },
      ]
    }),
  ) as Record<ExtractorId, BuildingDef>),
  ...(Object.fromEntries(
    AFFINITIES.map((a) => {
      const terrain = AFFINITY_TERRAIN[a]
      const res = AFFINITY_RESOURCE[a]
      return [
        `${a}-academy`,
        {
          id: `${a}-academy`,
          name: RESEARCH_NAMES[a],
          kind: 'research',
          affinity: a,
          text: `${AFFINITY_LABEL[a]} level = academy level. More ${AFFINITY_LABEL[a]} citizens, stronger carriers, stronger ${AFFINITY_LABEL[a]} synergies. Attunes to neighbouring ${TERRAIN_DEFS[terrain].label.toLowerCase()}.`,
          allowed: 'any',
          unique: true,
          maxLevel: 4,
          cost: (level: number) => ({ gold: 3 + 2 * level, [res]: 3 * level }),
          base: {},
          adjacency: [{ per: { terrain }, add: { attune: 1 }, cap: 3 }],
        } satisfies BuildingDef,
      ]
    }),
  ) as Record<AcademyId, BuildingDef>),
}

export const BUILDINGS: BuildingDef[] = Object.values(BUILDING_DEFS).filter((b) => b.kind !== 'capital')
export const academyId = (a: Affinity): AcademyId => `${a}-academy`

export function canPlaceOn(def: BuildingDef, terrain: TerrainId): boolean {
  if (!TERRAIN_DEFS[terrain].buildable) return false
  return def.allowed === 'any' ? true : def.allowed.includes(terrain)
}

/** Total spent to reach `level`. */
export function totalCost(def: BuildingDef, level: number): Cost {
  const out: Cost = {}
  for (let l = 1; l <= level; l++) {
    for (const [k, v] of Object.entries(def.cost(l)) as [keyof Cost, number][]) out[k] = (out[k] ?? 0) + v
  }
  return out
}
