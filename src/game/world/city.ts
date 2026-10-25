/**
 * Evaluates the whole territory: per-tile outputs (with adjacency), per-turn
 * yields (before morale), the troop-wide combat bonuses, and affinity levels.
 */
import { CONFIG } from '../config'
import { AFFINITIES, type Affinity } from '../affinities'
import { BUILDING_DEFS, type BuildingId, type OutputKey, type Outputs, type Selector } from './buildings'
import { hexKey, type Hex } from './hex'
import { ownedTiles, tileNeighbors, type Tile, type WorldMap } from './map'
import { AFFINITY_TERRAIN, RESOURCES, TERRAIN_DEFS, TERRAINS, type ResourceId, type TerrainId } from './terrain'

export interface OutputLine {
  text: string
  add: Outputs
}

export interface TileOutput {
  output: Outputs
  lines: OutputLine[]
}

const matches = (sel: Selector, self: Tile, n: Tile) =>
  'terrain' in sel ? n.terrain === sel.terrain : 'building' in sel ? n.building?.id === sel.building : n.terrain === self.terrain

const selectorLabel = (sel: Selector, self: Tile) =>
  'terrain' in sel
    ? TERRAIN_DEFS[sel.terrain].label.toLowerCase()
    : 'building' in sel
      ? BUILDING_DEFS[sel.building].name.toLowerCase()
      : TERRAIN_DEFS[self.terrain].label.toLowerCase()

function addInto(target: Outputs, add: Outputs, times = 1) {
  for (const [k, v] of Object.entries(add) as [OutputKey, number][]) target[k] = (target[k] ?? 0) + v * times
}

/**
 * Output of `id` placed on `tile` (the tile may currently hold anything; only
 * neighbours are inspected). Used both for the live city and for build previews.
 */
export function evaluateBuilding(map: WorldMap, tile: Hex, id: BuildingId): TileOutput {
  const self = map.tiles.find((t) => t.q === tile.q && t.r === tile.r)!
  const def = BUILDING_DEFS[id]
  const output: Outputs = {}
  const lines: OutputLine[] = []
  if (Object.keys(def.base).length) {
    addInto(output, def.base)
    lines.push({ text: 'base', add: def.base })
  }
  const ns = tileNeighbors(map, self)
  for (const rule of def.adjacency) {
    const n = Math.min(rule.cap ?? Infinity, ns.filter((x) => matches(rule.per, self, x)).length)
    if (!n) continue
    addInto(output, rule.add, n)
    const add: Outputs = {}
    addInto(add, rule.add, n)
    lines.push({ text: `${n} adjacent ${selectorLabel(rule.per, self)}`, add })
  }
  return { output, lines }
}

export function rawTileOutput(tile: Tile): TileOutput {
  const def = TERRAIN_DEFS[tile.terrain]
  const add = { [def.resource]: def.rawYield } as Outputs
  return { output: add, lines: [{ text: `raw ${def.label.toLowerCase()}`, add }] }
}

export function tileOutput(map: WorldMap, tile: Tile): TileOutput {
  return tile.building ? evaluateBuilding(map, tile, tile.building.id) : rawTileOutput(tile)
}

export interface CityStats {
  yields: Record<ResourceId, number>
  atkPct: number
  hpPct: number
  defPct: number
  /** Give `tradeRate` of one material for 1 of another; null without a Trading Post. */
  tradeRate: number | null
  affinityLevels: Record<Affinity, number>
  attune: Record<Affinity, number>
  terrainCounts: Record<TerrainId, number>
  tiles: Record<string, TileOutput>
}

export function evaluateCity(map: WorldMap): CityStats {
  const total: Outputs = {}
  const tiles: Record<string, TileOutput> = {}
  const terrainCounts = Object.fromEntries(TERRAINS.map((t) => [t, 0])) as Record<TerrainId, number>
  const affinityLevels = Object.fromEntries(AFFINITIES.map((a) => [a, 0])) as Record<Affinity, number>
  const attune = Object.fromEntries(AFFINITIES.map((a) => [a, 0])) as Record<Affinity, number>
  let hasTradingPost = false

  for (const t of ownedTiles(map)) {
    terrainCounts[t.terrain]++
    const out = tileOutput(map, t)
    tiles[hexKey(t)] = out
    addInto(total, out.output)
    const def = t.building && BUILDING_DEFS[t.building.id]
    if (def?.affinity) {
      affinityLevels[def.affinity] = t.building!.level
      attune[def.affinity] = out.output.attune ?? 0
    }
    if (t.building?.id === 'trading-post') hasTradingPost = true
  }

  const yields = Object.fromEntries(RESOURCES.map((r) => [r, total[r] ?? 0])) as Record<ResourceId, number>
  return {
    yields,
    atkPct: total.atkPct ?? 0,
    hpPct: total.hpPct ?? 0,
    defPct: total.defPct ?? 0,
    tradeRate: hasTradingPost ? Math.max(CONFIG.trade.best, CONFIG.trade.worst - (total.trade ?? 0)) : null,
    affinityLevels,
    attune,
    terrainCounts,
    tiles,
  }
}

/** Relative birth weight of each affinity: a mutation floor, plus land, plus research. */
export function affinityBirthWeights(stats: Pick<CityStats, 'terrainCounts' | 'affinityLevels' | 'attune'>): Record<Affinity, number> {
  const w = CONFIG.affinity.birthWeight
  return Object.fromEntries(
    AFFINITIES.map((a) => [
      a,
      w.mutation + w.perTile * stats.terrainCounts[AFFINITY_TERRAIN[a]] + w.perLevel * stats.affinityLevels[a] + w.perAttune * stats.attune[a],
    ]),
  ) as Record<Affinity, number>
}

/** Combat bonuses the city gives its troop. */
export interface TeamBonuses {
  affinityLevels: Partial<Record<Affinity, number>>
  attune: Partial<Record<Affinity, number>>
  hpMult: number
  atkMult: number
  defMult: number
}

export const cityBonuses = (stats: CityStats): TeamBonuses => ({
  affinityLevels: stats.affinityLevels,
  attune: stats.attune,
  hpMult: 1 + stats.hpPct,
  atkMult: 1 + stats.atkPct,
  defMult: 1 + stats.defPct,
})
