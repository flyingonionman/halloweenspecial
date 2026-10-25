/**
 * Terrain → resource → affinity.
 *
 * Resources are gold, food, stone and seven essences, one per tier-1 element.
 * Each has a secondary role beside training units and feeding research:
 *   stone  — every building is built from it
 *   earth  — "Mud": claims land (an alternative to gold)
 *   light  — offered at a Church for morale
 *   water  — builds Fisheries, which turn lakes into food
 *   fire, wind, dark, arcane — training and research only
 *
 * Every run's land is one *biome*: a basic terrain (plains, steppe or
 * highlands) dotted with that biome's two speciality terrains, plus a few strays.
 */

export const ELEMENTS = ['fire', 'water', 'earth', 'wind', 'light', 'dark', 'arcane'] as const
export type ElementId = (typeof ELEMENTS)[number]

export const RESOURCES = ['gold', 'food', 'stone', ...ELEMENTS] as const
export type ResourceId = (typeof RESOURCES)[number]

/** Resources you stockpile. Food is a per-turn flow that drives growth. */
export const STOCK_RESOURCES = RESOURCES.filter((r): r is Exclude<ResourceId, 'food'> => r !== 'food')
export type StockResource = (typeof STOCK_RESOURCES)[number]
/** Stockable resources other than gold: what buildings and trade deal in. */
export const MATERIALS = STOCK_RESOURCES.filter((r): r is Exclude<StockResource, 'gold'> => r !== 'gold')
export type Material = (typeof MATERIALS)[number]

export type Stock = Record<StockResource, number>
export type Cost = Partial<Record<StockResource, number>>

export const isElement = (r: string): r is ElementId => (ELEMENTS as readonly string[]).includes(r)

export const RESOURCE_LABEL: Record<ResourceId, string> = {
  gold: 'Gold',
  food: 'Food',
  stone: 'Stone',
  // Physical things, not the elements themselves: the affinities keep the element names.
  fire: 'Ember',
  water: 'Hydrocorals',
  earth: 'Mud',
  wind: 'Gale Spirits',
  light: 'Light',
  dark: 'Dark',
  arcane: 'Arcane',
}

export const TERRAINS = ['plains', 'steppe', 'highlands', 'lake', 'forest', 'hills', 'volcanic', 'mountains', 'tundra', 'leyfield'] as const
export type TerrainId = (typeof TERRAINS)[number]

export interface TerrainDef {
  id: TerrainId
  label: string
  /** What an owned tile yields with no building on it, and what a Mine digs there. */
  resource: ResourceId
  rawYield: number
  /** The tier-1 affinity this land breeds and lets a neighbouring Academy research. */
  affinity: ElementId | null
  /** Basic terrains make up most of a biome; specialities are the interesting patches. */
  basic: boolean
  /** False: only buildings that name this terrain may stand on it (Fishery on lakes). */
  buildable: boolean
}

const def = (id: TerrainId, label: string, resource: ResourceId, extra: Partial<TerrainDef> = {}): TerrainDef => ({
  id,
  label,
  resource,
  rawYield: 1,
  affinity: resource !== 'gold' && resource !== 'food' && resource !== 'stone' ? (resource as ElementId) : null,
  basic: false,
  buildable: true,
  ...extra,
})

export const TERRAIN_DEFS: Record<TerrainId, TerrainDef> = {
  plains: def('plains', 'Plains', 'food', { basic: true }),
  steppe: def('steppe', 'Steppe', 'earth', { basic: true }),
  highlands: def('highlands', 'Highlands', 'wind', { basic: true }),
  lake: def('lake', 'Lake', 'water', { buildable: false }),
  forest: def('forest', 'Forest', 'earth'),
  hills: def('hills', 'Hills', 'stone', { rawYield: 2 }),
  volcanic: def('volcanic', 'Volcanic', 'fire'),
  mountains: def('mountains', 'Mountains', 'stone', { rawYield: 2 }),
  tundra: def('tundra', 'Tundra', 'water'),
  leyfield: def('leyfield', 'Leyfield', 'arcane'),
}

export const BIOMES = ['plains', 'steppe', 'highlands'] as const satisfies readonly TerrainId[]
export type Biome = (typeof BIOMES)[number]

/** Each biome's two speciality terrains. Leyfields only ever appear as strays. */
export const BIOME_SPECIALS: Record<Biome, readonly [TerrainId, TerrainId]> = {
  plains: ['lake', 'forest'],
  steppe: ['volcanic', 'hills'],
  highlands: ['mountains', 'tundra'],
}

export const emptyStock = (): Stock => Object.fromEntries(STOCK_RESOURCES.map((r) => [r, 0])) as Stock
