/**
 * The board: a hex map of terrain regions around your capital, with NPC camps
 * scattered toward the edges.
 */
import { CONFIG } from '../config'
import type { Rng } from '../rng'
import { hexDistance, hexKey, hexesInRadius, neighbors, type Hex } from './hex'
import { AFFINITY_TERRAINS, TERRAINS, type TerrainId } from './terrain'
import type { BuildingId } from './buildings'

export interface Camp {
  /** 1–3: troop size and quality. */
  strength: number
  name: string
}

export interface PlacedBuilding {
  id: BuildingId
  level: number
}

export interface Tile extends Hex {
  terrain: TerrainId
  owned: boolean
  building: PlacedBuilding | null
  camp: Camp | null
}

export interface WorldMap {
  radius: number
  /** The terrain your starting region leans toward. */
  homeBiome: TerrainId
  tiles: Tile[]
}

const CAMP_NAMES = ['Bandit Hollow', 'Wight Barrow', 'Gnoll Warren', 'Witch Copse', 'Raider Camp', 'Grave Mound', 'Ogre Den', 'Cultist Ring']

export function generateMap(rng: Rng, radius: number = CONFIG.map.radius): WorldMap {
  const all = hexesInRadius(radius)
  const homeBiome = rng.pick(AFFINITY_TERRAINS.filter((t) => t !== 'lake'))

  // Region seeds: the centre ring leans hard toward the home biome; elsewhere is a mix.
  const seeds: { hex: Hex; terrain: TerrainId }[] = [{ hex: { q: 1, r: 0 }, terrain: homeBiome }]
  for (let i = 1; i < CONFIG.map.regions; i++) {
    const hex = rng.pick(all)
    const near = hexDistance(hex, { q: 0, r: 0 }) <= 2
    const terrain = rng.weighted(TERRAINS, (t) => (t === homeBiome ? (near ? 6 : 1.5) : t === 'plains' ? 2.2 : t === 'lake' ? 0.8 : 1))
    seeds.push({ hex, terrain })
  }

  const tiles: Tile[] = all.map((hex) => {
    let best = seeds[0]!
    let bestD = Infinity
    for (const s of seeds) {
      const d = hexDistance(hex, s.hex) + rng.next() * 0.9
      if (d < bestD) [best, bestD] = [s, d]
    }
    return { ...hex, terrain: best.terrain, owned: false, building: null, camp: null }
  })

  const at = (h: Hex) => tiles.find((t) => t.q === h.q && t.r === h.r)
  const capital = at({ q: 0, r: 0 })!
  capital.terrain = 'plains'
  capital.owned = true
  capital.building = { id: 'capital', level: 1 }
  for (const n of neighbors(capital)) {
    const t = at(n)!
    t.owned = true
  }
  // Guarantee the home biome and some food in the starting ring.
  const ring = neighbors(capital).map((n) => at(n)!)
  if (!ring.some((t) => t.terrain === homeBiome)) ring[0]!.terrain = homeBiome
  if (!ring.some((t) => t.terrain === 'plains' || t.terrain === 'lake')) ring[3]!.terrain = 'plains'

  // Camps: away from the capital, never on lakes.
  const candidates = tiles.filter((t) => hexDistance(t, capital) >= CONFIG.map.campMinDistance && t.terrain !== 'lake')
  for (let i = 0; i < CONFIG.map.camps && candidates.length; i++) {
    const t = candidates.splice(Math.floor(rng.next() * candidates.length), 1)[0]!
    const d = hexDistance(t, capital)
    t.camp = { strength: Math.min(3, Math.max(1, d - 2 + (rng.chance(0.3) ? 1 : 0))), name: rng.pick(CAMP_NAMES) }
  }

  return { radius, homeBiome, tiles }
}

export const tileAt = (map: WorldMap, h: Hex) => map.tiles.find((t) => t.q === h.q && t.r === h.r)

export const tileNeighbors = (map: WorldMap, h: Hex): Tile[] =>
  neighbors(h)
    .map((n) => tileAt(map, n))
    .filter((t): t is Tile => !!t)

export const ownedTiles = (map: WorldMap) => map.tiles.filter((t) => t.owned)

/** Unowned tiles touching your territory. */
export function frontier(map: WorldMap): Tile[] {
  const owned = new Set(ownedTiles(map).map(hexKey))
  return map.tiles.filter((t) => !t.owned && neighbors(t).some((n) => owned.has(hexKey(n))))
}
