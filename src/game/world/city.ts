/**
 * Evaluates the whole territory: per-tile outputs (with adjacency), per-turn
 * yields (before morale), the troop-wide combat bonuses, and the academies
 * (which decide affinity levels and births).
 */
import { CONFIG } from '../config'
import { AFFINITIES, AFFINITY_DEFS, type Affinity } from '../affinities'
import { BUILDING_DEFS, baseOutput, type BuildingId, type OutputKey, type Outputs, type Selector } from './buildings'
import { hexKey, type Hex } from './hex'
import { ownedTiles, tileNeighbors, type Tile, type WorldMap } from './map'
import { RESOURCES, TERRAIN_DEFS, TERRAINS, type ResourceId, type TerrainId } from './terrain'

export interface OutputLine {
  text: string
  add: Outputs
}

export interface TileOutput {
  output: Outputs
  lines: OutputLine[]
}

const matches = (sel: Selector, self: Tile, n: Tile) =>
  'terrain' in sel
    ? typeof sel.terrain === 'string'
      ? n.terrain === sel.terrain
      : sel.terrain.includes(n.terrain)
    : 'building' in sel
      ? n.building?.id === sel.building
      : n.terrain === self.terrain

const selectorLabel = (sel: Selector, self: Tile) =>
  'terrain' in sel
    ? (typeof sel.terrain === 'string' ? [sel.terrain] : sel.terrain).map((t) => TERRAIN_DEFS[t].label.toLowerCase()).join('/')
    : 'building' in sel
      ? BUILDING_DEFS[sel.building].name.toLowerCase()
      : TERRAIN_DEFS[self.terrain].label.toLowerCase()

function addInto(target: Outputs, add: Outputs, times = 1) {
  for (const [k, v] of Object.entries(add) as [OutputKey, number][]) target[k] = (target[k] ?? 0) + v * times
}

/**
 * Output of `id` at `level` placed on `tile` (the tile may currently hold anything;
 * only its terrain and neighbours are inspected). Used for the live city and for previews.
 */
export function evaluateBuilding(map: WorldMap, tile: Hex, id: BuildingId, level = 1): TileOutput {
  const self = map.tiles.find((t) => t.q === tile.q && t.r === tile.r)!
  const def = BUILDING_DEFS[id]
  const output: Outputs = {}
  const lines: OutputLine[] = []
  const base = baseOutput(def, self.terrain, level)
  if (Object.keys(base).length) {
    addInto(output, base)
    lines.push({ text: 'base', add: base })
  }
  const ns = tileNeighbors(map, self)
  for (const rule of def.adjacency) {
    const n = Math.min(rule.cap ?? Infinity, ns.filter((x) => matches(rule.per, self, x)).length)
    if (!n) continue
    const per: Outputs = rule.add === 'tile' ? { [TERRAIN_DEFS[self.terrain].resource]: 1 } : rule.add
    const add: Outputs = {}
    addInto(add, per, n)
    addInto(output, add)
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
  return tile.building ? evaluateBuilding(map, tile, tile.building.id, tile.building.level) : rawTileOutput(tile)
}

/** A dedicated academy: what it teaches, and how well. */
export interface AcademyLevel {
  affinity: Affinity
  level: number
}

export interface CityStats {
  yields: Record<ResourceId, number>
  atkPct: number
  hpPct: number
  defPct: number
  /** Give `tradeRate` of one material for 1 of another; null without a Trading Post. */
  tradeRate: number | null
  /** Each affinity's level: your best academy of it (0 without one). */
  affinityLevels: Record<Affinity, number>
  /** Every dedicated academy you own. They alone decide which affinities citizens are born with. */
  academies: AcademyLevel[]
  /** Academies you own, dedicated or not. */
  academyCount: number
  terrainCounts: Record<TerrainId, number>
  tiles: Record<string, TileOutput>
}

export function evaluateCity(map: WorldMap): CityStats {
  const total: Outputs = {}
  const tiles: Record<string, TileOutput> = {}
  const terrainCounts = Object.fromEntries(TERRAINS.map((t) => [t, 0])) as Record<TerrainId, number>
  const affinityLevels = Object.fromEntries(AFFINITIES.map((a) => [a, 0])) as Record<Affinity, number>
  const academies: AcademyLevel[] = []
  let academyCount = 0
  let hasTradingPost = false

  for (const t of ownedTiles(map)) {
    terrainCounts[t.terrain]++
    const out = tileOutput(map, t)
    tiles[hexKey(t)] = out
    addInto(total, out.output)
    const b = t.building
    if (b?.id === 'academy') {
      academyCount++
      // Starved academies (upkeep unpaid) teach nothing; pending changes count from next turn.
      if (b.affinity && b.level > 0 && !b.starved) {
        academies.push({ affinity: b.affinity, level: b.level })
        affinityLevels[b.affinity] = Math.max(affinityLevels[b.affinity], b.level)
      }
    }
    if (b?.id === 'trading-post') hasTradingPost = true
  }

  const yields = Object.fromEntries(RESOURCES.map((r) => [r, total[r] ?? 0])) as Record<ResourceId, number>
  return {
    yields,
    atkPct: total.atkPct ?? 0,
    hpPct: total.hpPct ?? 0,
    defPct: total.defPct ?? 0,
    tradeRate: hasTradingPost ? Math.max(CONFIG.trade.best, CONFIG.trade.worst - (total.trade ?? 0)) : null,
    affinityLevels,
    academies,
    academyCount,
    terrainCounts,
    tiles,
  }
}

/** Terrains whose land breeds this tier-1 affinity. */
export const landOf = (a: Affinity) => TERRAINS.filter((t) => TERRAIN_DEFS[t].affinity === a)

/** Tier 1 is always open; higher tiers need an academy of every parent at the unlock level. */
export function isUnlocked(a: Affinity, levels: Partial<Record<Affinity, number>>): boolean {
  return AFFINITY_DEFS[a].parents.every((p) => (levels[p] ?? 0) >= CONFIG.affinity.unlockLevel)
}

/** Combat bonuses the city gives its troop. */
export interface TeamBonuses {
  affinityLevels: Partial<Record<Affinity, number>>
  hpMult: number
  atkMult: number
  defMult: number
}

export const cityBonuses = (stats: CityStats): TeamBonuses => ({
  affinityLevels: stats.affinityLevels,
  hpMult: 1 + stats.hpPct,
  atkMult: 1 + stats.atkPct,
  defMult: 1 + stats.defPct,
})
