/**
 * Buildings sit on tiles. Each one has an output and adjacency rules: its
 * output grows with the right terrain or buildings next to it. Every building
 * is built from stone (plus gold, and sometimes an essence).
 *
 * Kinds:
 *   gather   — the Mine line (Mine → Quarry → Excavator): digs whatever its tile holds
 *   civic    — food, gold, trade
 *   faith    — Church (light) and Crypt (dark)
 *   research — Academies: dedicated to an affinity, fed essence every turn; the only source of affinities at birth
 *   military — permanent combat bonuses for every unit (the tempo line)
 */
import type { ElementId } from './terrain'
import { TERRAIN_DEFS, type Cost, type ResourceId, type TerrainId } from './terrain'

export type OutputKey = ResourceId | 'atkPct' | 'hpPct' | 'defPct' | 'trade'
export type Outputs = Partial<Record<OutputKey, number>>

export type BuildingId =
  | 'capital'
  | 'farm'
  | 'fishery'
  | 'market'
  | 'trading-post'
  | 'mine'
  | 'church'
  | 'crypt'
  | 'academy'
  | 'barracks'
  | 'walls'
  | 'armory'

export type BuildingKind = 'capital' | 'gather' | 'civic' | 'faith' | 'research' | 'military'

export type Selector = { terrain: TerrainId | readonly TerrainId[] } | { building: BuildingId } | { sameTerrain: true }

export interface AdjacencyRule {
  per: Selector
  /** 'tile' = +1 of whatever resource the building's own tile holds. */
  add: Outputs | 'tile'
  /** Max neighbours counted. */
  cap?: number
}

export interface BuildingDef {
  id: BuildingId
  name: string
  /** Names by level, for buildings that change as they grow (Mine → Quarry → Excavator). */
  levelNames?: readonly string[]
  kind: BuildingKind
  text: string
  /** Terrains it can be placed on; 'any' = any buildable terrain. */
  allowed: readonly TerrainId[] | 'any'
  unique?: boolean
  maxLevel: number
  /** Cost to reach `level` (1 = initial build). */
  cost: (level: number) => Cost
  /** Output before adjacency. A function when it depends on the tile or level. */
  base: Outputs | ((terrain: TerrainId, level: number) => Outputs)
  adjacency: AdjacencyRule[]
  /** Faith buildings: the essence (and so the affinity) they serve. */
  affinity?: ElementId
}

const flat = (c: Cost) => () => c

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
    base: { food: 5, gold: 4, stone: 1 },
    adjacency: [],
  },
  farm: {
    id: 'farm',
    name: 'Farm',
    levelNames: ['Farm', 'Granary', 'Estate'],
    kind: 'civic',
    text: 'Food feeds the people and, past that, growth. Thrives beside lakes and other farms. Upgrades into a Granary, then an Estate.',
    allowed: ['plains', 'steppe', 'highlands', 'forest'],
    maxLevel: 3,
    cost: (level) => [{ gold: 3, stone: 1 }, { gold: 8, stone: 4 }, { gold: 16, stone: 8 }][level - 1] ?? {},
    base: (_terrain, level) => ({ food: [2, 4, 7][level - 1] ?? 2 }),
    adjacency: [
      { per: { terrain: 'lake' }, add: { food: 1 }, cap: 2 },
      { per: { building: 'farm' }, add: { food: 1 }, cap: 2 },
    ],
  },
  fishery: {
    id: 'fishery',
    name: 'Fishery',
    levelNames: ['Fishery', 'Weir', 'Hatchery'],
    kind: 'civic',
    text: 'The only building that stands on water. Built with hydrocorals; turns a lake into food. Upgrades into a Weir, then a Hatchery.',
    allowed: ['lake'],
    maxLevel: 3,
    cost: (level) => [{ gold: 3, stone: 1, water: 3 }, { gold: 8, stone: 4, water: 4 }, { gold: 16, stone: 8, water: 6 }][level - 1] ?? {},
    base: (_terrain, level) => ({ food: [3, 5, 8][level - 1] ?? 3 }),
    adjacency: [{ per: { terrain: 'lake' }, add: { food: 1 }, cap: 3 }],
  },
  market: {
    id: 'market',
    name: 'Market',
    kind: 'civic',
    text: 'Gold every turn. Sells the harvest of neighbouring farms and fisheries.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 5, stone: 2 }),
    base: { gold: 2 },
    adjacency: [
      { per: { building: 'farm' }, add: { gold: 1 }, cap: 3 },
      { per: { building: 'fishery' }, add: { gold: 1 }, cap: 2 },
      { per: { building: 'capital' }, add: { gold: 1 }, cap: 1 },
    ],
  },
  'trading-post': {
    id: 'trading-post',
    name: 'Trading Post',
    kind: 'civic',
    text: 'Open it to set up trade routes: part of every turn’s income of one material, turned into another. Better rates beside a lake or market.',
    allowed: 'any',
    unique: true,
    maxLevel: 1,
    cost: flat({ gold: 8, stone: 2 }),
    base: { trade: 0 },
    adjacency: [
      { per: { terrain: 'lake' }, add: { trade: 1 }, cap: 1 },
      { per: { building: 'market' }, add: { trade: 1 }, cap: 1 },
    ],
  },
  mine: {
    id: 'mine',
    name: 'Mine',
    levelNames: ['Mine', 'Quarry', 'Excavator'],
    kind: 'gather',
    text: 'Digs whatever its tile holds: stone, or the essence of the land. +1 per neighbouring tile of the same terrain. Upgrades into a Quarry, then an Excavator.',
    allowed: ['steppe', 'highlands', 'forest', 'hills', 'volcanic', 'mountains', 'tundra', 'leyfield'],
    maxLevel: 3,
    cost: (level) => [{ gold: 3, stone: 1 }, { gold: 8, stone: 4 }, { gold: 16, stone: 8 }][level - 1] ?? {},
    base: (terrain, level) => {
      const t = TERRAIN_DEFS[terrain]
      return { [t.resource]: t.rawYield + level }
    },
    adjacency: [{ per: { sameTerrain: true }, add: 'tile', cap: 3 }],
  },
  church: {
    id: 'church',
    name: 'Church',
    kind: 'faith',
    affinity: 'light',
    text: 'Produces light, the essence a Light Academy is offered. Open it to offer light for morale.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 6, stone: 3 }),
    base: { light: 2 },
    adjacency: [{ per: { terrain: ['plains', 'highlands'] }, add: { light: 1 }, cap: 1 }],
  },
  crypt: {
    id: 'crypt',
    name: 'Crypt',
    kind: 'faith',
    affinity: 'dark',
    text: 'Produces dark, the essence a Dark Academy is offered.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 6, stone: 3 }),
    base: { dark: 2 },
    adjacency: [{ per: { terrain: ['mountains', 'hills'] }, add: { dark: 1 }, cap: 1 }],
  },
  academy: {
    id: 'academy',
    name: 'Academy',
    kind: 'research',
    text: 'Built empty. Open it to dedicate it to an element (hydrocorals make a Water Academy), raise its level, or evolve it into a higher tier. Each step costs an upfront payment plus a share of your income every turn from then on. Each academy makes citizens likelier to be born with its affinity, and its level is the most points they can carry. Build as many as you like: every one after the first also costs arcane.',
    allowed: 'any',
    maxLevel: 4,
    // Only the empty building has a fixed price; growing it depends on the affinity (researchCost + academyFlow).
    cost: (level) => (level === 1 ? { gold: 8, stone: 4 } : {}),
    base: {},
    adjacency: [],
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    kind: 'military',
    text: 'Every unit hits harder. Feeds on nearby mines.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 5, stone: 2, fire: 2 }),
    base: { atkPct: 0.08 },
    adjacency: [{ per: { building: 'mine' }, add: { atkPct: 0.03 }, cap: 3 }],
  },
  walls: {
    id: 'walls',
    name: 'Walls',
    kind: 'military',
    text: 'Every unit is hardier. Stronger against hills and mountains.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 5, stone: 4 }),
    base: { hpPct: 0.08 },
    adjacency: [{ per: { terrain: ['hills', 'mountains'] }, add: { hpPct: 0.02 }, cap: 3 }],
  },
  armory: {
    id: 'armory',
    name: 'Armory',
    kind: 'military',
    text: 'Every unit is better armoured. Best between barracks and walls.',
    allowed: 'any',
    maxLevel: 1,
    cost: flat({ gold: 6, stone: 2, earth: 2 }),
    base: { defPct: 0.08 },
    adjacency: [
      { per: { building: 'barracks' }, add: { defPct: 0.04 }, cap: 2 },
      { per: { building: 'walls' }, add: { defPct: 0.04 }, cap: 2 },
    ],
  },
}

export const BUILDINGS: BuildingDef[] = Object.values(BUILDING_DEFS).filter((b) => b.kind !== 'capital')

/** Display name at a level (the Mine becomes a Quarry, then an Excavator). */
export const buildingName = (id: BuildingId, level = 1) => BUILDING_DEFS[id].levelNames?.[level - 1] ?? BUILDING_DEFS[id].name

/** Base output for this building on this terrain at this level. */
export const baseOutput = (def: BuildingDef, terrain: TerrainId, level = 1): Outputs =>
  typeof def.base === 'function' ? def.base(terrain, level) : def.base

export function canPlaceOn(def: BuildingDef, terrain: TerrainId): boolean {
  if (def.allowed === 'any') return TERRAIN_DEFS[terrain].buildable
  return def.allowed.includes(terrain)
}

/** Total spent to reach `level`. */
export function totalCost(def: BuildingDef, level: number): Cost {
  const out: Cost = {}
  for (let l = 1; l <= level; l++) {
    for (const [k, v] of Object.entries(def.cost(l)) as [keyof Cost, number][]) out[k] = (out[k] ?? 0) + v
  }
  return out
}
