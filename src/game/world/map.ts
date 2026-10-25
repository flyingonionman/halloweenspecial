/**
 * The board: one biome around your capital, with NPC camps toward the edges.
 *
 * A biome is mostly a single contiguous basic terrain (~50%), patched with its
 * two speciality terrains in clusters (~40%) and a few strays of anything else
 * (~10%). Nothing non-basic ever stands alone: specialities come in clusters of
 * 3–5, strays in pairs. The capital's ring is basic land with one speciality
 * tile, the tip of a cluster reaching in from outside.
 */
import type { Affinity } from '../affinities'
import { CONFIG } from '../config'
import type { Rng } from '../rng'
import { hexDistance, hexKey, hexesInRadius, neighbors, type Hex } from './hex'
import { BIOME_SPECIALS, BIOMES, TERRAINS, type Biome, type TerrainId } from './terrain'
import type { BuildingId } from './buildings'

export interface Camp {
  /** 1–3: troop size and quality. */
  strength: number
  name: string
}

export interface PlacedBuilding {
  id: BuildingId
  /** Academies: 0 until dedicated, then the affinity's level there. */
  level: number
  /** Academies: the affinity it was dedicated to with an offering. */
  affinity?: Affinity
}

export interface Tile extends Hex {
  terrain: TerrainId
  owned: boolean
  building: PlacedBuilding | null
  camp: Camp | null
}

export interface WorldMap {
  radius: number
  /** The basic terrain this run's land is made of. */
  homeBiome: Biome
  tiles: Tile[]
}

const CAMP_NAMES = ['Bandit Hollow', 'Wight Barrow', 'Gnoll Warren', 'Witch Copse', 'Raider Camp', 'Grave Mound', 'Ogre Den', 'Cultist Ring']

export function generateMap(rng: Rng, radius: number = CONFIG.map.radius, biome?: Biome): WorldMap {
  const homeBiome = biome ?? rng.pick(BIOMES)
  const [s1, s2] = BIOME_SPECIALS[homeBiome]
  const tiles: Tile[] = hexesInRadius(radius).map((hex) => ({ ...hex, terrain: homeBiome, owned: false, building: null, camp: null }))
  const byKey = new Map(tiles.map((t) => [hexKey(t), t]))
  const at = (h: Hex) => byKey.get(hexKey(h))
  const origin = { q: 0, r: 0 }
  const outer = () => tiles.filter((t) => hexDistance(t, origin) >= 2 && t.terrain === homeBiome)

  const { special, stray } = CONFIG.map.mix
  const specialTarget = Math.round(tiles.length * special)
  const strayTarget = Math.round(tiles.length * stray)

  /** Grow a cluster of `terrain` from `seed` through basic land outside the ring. */
  const grow = (seed: Tile, terrain: TerrainId, size: number) => {
    const blob = [seed]
    while (blob.length < size) {
      const edge = blob
        .flatMap((t) => neighbors(t).map(at))
        .filter((t): t is Tile => !!t && t.terrain === homeBiome && hexDistance(t, origin) >= 2 && !blob.includes(t))
      if (!edge.length) break
      blob.push(edge[Math.floor(rng.next() * edge.length)]!)
    }
    // Hemmed in with no room to grow: leave it basic rather than a lone odd tile.
    if (blob.length < 2) return 0
    for (const t of blob) t.terrain = terrain
    return blob.length
  }

  // The ring's one speciality tile, grown outward so it's the tip of a cluster.
  const ring = neighbors(origin).map((n) => at(n)!)
  let specials = grow(ring[Math.floor(rng.next() * ring.length)]!, s1, 3)

  // Speciality clusters of 3–5, alternating the two.
  for (let i = 0; specials < specialTarget && i < 60; i++) {
    const pool = outer()
    if (!pool.length) break
    const size = Math.min(3 + Math.floor(rng.next() * 3), Math.max(2, specialTarget - specials))
    specials += grow(pool[Math.floor(rng.next() * pool.length)]!, i % 2 === 0 ? s2 : s1, size)
  }

  // Strays: pairs of anything else, leyfields included.
  const others = TERRAINS.filter((t) => t !== homeBiome)
  for (let strays = 0, i = 0; strays < strayTarget && i < 30; i++) {
    const pool = outer()
    if (!pool.length) break
    strays += grow(pool[Math.floor(rng.next() * pool.length)]!, rng.pick(others), 2)
  }

  const capital = at(origin)!
  capital.owned = true
  capital.building = { id: 'capital', level: 1 }
  for (const t of ring) t.owned = true

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
