/**
 * Terrain → resource → affinity. Your land decides which resources you can
 * produce and which affinities your citizens are born with.
 */
import type { Affinity } from '../affinities'

export const RESOURCES = ['gold', 'food', 'timber', 'iron', 'stone', 'hide', 'ice', 'ember', 'crystal', 'skystone'] as const
export type ResourceId = (typeof RESOURCES)[number]

/** Resources you stockpile. Food is a per-turn flow that drives growth. */
export const STOCK_RESOURCES = RESOURCES.filter((r): r is Exclude<ResourceId, 'food'> => r !== 'food')
export type StockResource = (typeof STOCK_RESOURCES)[number]
/** Stockable resources other than gold: what buildings and trade deal in. */
export const MATERIALS = STOCK_RESOURCES.filter((r): r is Exclude<StockResource, 'gold'> => r !== 'gold')
export type Material = (typeof MATERIALS)[number]

export type Stock = Record<StockResource, number>
export type Cost = Partial<Record<StockResource, number>>

export const RESOURCE_LABEL: Record<ResourceId, string> = {
  gold: 'Gold',
  food: 'Food',
  timber: 'Timber',
  iron: 'Iron',
  stone: 'Stone',
  hide: 'Hide',
  ice: 'Ice',
  ember: 'Ember',
  crystal: 'Crystal',
  skystone: 'Skystone',
}

export const TERRAINS = ['plains', 'lake', 'forest', 'hills', 'mountains', 'steppe', 'tundra', 'volcanic', 'leyfield', 'highlands'] as const
export type TerrainId = (typeof TERRAINS)[number]

export interface TerrainDef {
  id: TerrainId
  label: string
  /** What an owned tile yields with no building on it. */
  resource: ResourceId
  rawYield: number
  affinity: Affinity | null
  buildable: boolean
}

export const TERRAIN_DEFS: Record<TerrainId, TerrainDef> = {
  plains: { id: 'plains', label: 'Plains', resource: 'food', rawYield: 1, affinity: null, buildable: true },
  lake: { id: 'lake', label: 'Lake', resource: 'food', rawYield: 2, affinity: null, buildable: false },
  forest: { id: 'forest', label: 'Forest', resource: 'timber', rawYield: 1, affinity: 'bow', buildable: true },
  hills: { id: 'hills', label: 'Hills', resource: 'iron', rawYield: 1, affinity: 'sword', buildable: true },
  mountains: { id: 'mountains', label: 'Mountains', resource: 'stone', rawYield: 1, affinity: 'earth', buildable: true },
  steppe: { id: 'steppe', label: 'Steppe', resource: 'hide', rawYield: 1, affinity: 'shield', buildable: true },
  tundra: { id: 'tundra', label: 'Tundra', resource: 'ice', rawYield: 1, affinity: 'frost', buildable: true },
  volcanic: { id: 'volcanic', label: 'Volcanic', resource: 'ember', rawYield: 1, affinity: 'fire', buildable: true },
  leyfield: { id: 'leyfield', label: 'Leyfield', resource: 'crystal', rawYield: 1, affinity: 'arcane', buildable: true },
  highlands: { id: 'highlands', label: 'Highlands', resource: 'skystone', rawYield: 1, affinity: 'wind', buildable: true },
}

/** Terrains that carry an affinity (one per affinity). */
export const AFFINITY_TERRAINS = TERRAINS.filter((t) => TERRAIN_DEFS[t].affinity !== null)

export const AFFINITY_TERRAIN = Object.fromEntries(
  AFFINITY_TERRAINS.map((t) => [TERRAIN_DEFS[t].affinity!, t]),
) as Record<Affinity, TerrainId>

export const AFFINITY_RESOURCE = Object.fromEntries(
  AFFINITY_TERRAINS.map((t) => [TERRAIN_DEFS[t].affinity!, TERRAIN_DEFS[t].resource]),
) as Record<Affinity, Material>

export const emptyStock = (): Stock => Object.fromEntries(STOCK_RESOURCES.map((r) => [r, 0])) as Stock
