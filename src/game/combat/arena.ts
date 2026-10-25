/**
 * The battle arena: a hexagon of hex cells (pointy-top axial, like the world
 * map). One unit per cell. Cells are addressed by index into `cells`; the
 * neighbour table and distances are precomputed so the sim's pathing is cheap.
 */
import { CONFIG } from '../config'
import { hexDistance, hexKey, hexesInRadius, neighbors, type Hex } from '../world/hex'

export interface Arena {
  radius: number
  cells: Hex[]
  /** Neighbour cell index per cell per HEX_DIRS direction (−1 past the rim). Direction d's mirror is (d + 3) % 6. */
  adj: number[][]
  index: Map<string, number>
}

const cache = new Map<number, Arena>()

export function arena(radius: number = CONFIG.combat.arenaRadius): Arena {
  const hit = cache.get(radius)
  if (hit) return hit
  const cells = hexesInRadius(radius)
  const index = new Map(cells.map((h, i) => [hexKey(h), i]))
  const adj = cells.map((h) => neighbors(h).map((n) => index.get(hexKey(n)) ?? -1))
  const a = { radius, cells, adj, index }
  cache.set(radius, a)
  return a
}

export const cellDistance = (a: Arena, i: number, j: number) => hexDistance(a.cells[i]!, a.cells[j]!)

/**
 * Deployment slots for one side, best first. Team 0 stands west (−x), team 1
 * is the mirror image. `column` is 2q + r (proportional to x), so a column is a
 * vertical line of cells; slots fill from the middle outward.
 */
export function columnSlots(a: Arena, team: 0 | 1, column: number): number[] {
  const sign = team === 0 ? 1 : -1
  const out: number[] = []
  for (let i = 0; i < a.cells.length; i++) {
    const h = a.cells[i]!
    if (2 * h.q + h.r === sign * column) out.push(i)
  }
  return out.sort((i, j) => {
    const [hi, hj] = [a.cells[i]!, a.cells[j]!]
    return Math.abs(hi.r) - Math.abs(hj.r) || sign * (hj.r - hi.r)
  })
}

/** Front line (melee) and back line (ranged) columns for team 0; team 1 mirrors them. */
export const FRONT_COLUMNS = [-6, -7, -5, -8, -4] as const
export const BACK_COLUMNS = [-10, -9, -11, -8, -12] as const
