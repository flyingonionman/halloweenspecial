/** Axial hex coordinates, pointy-top. https://www.redblobgames.com/grids/hexagons/ */

export interface Hex {
  q: number
  r: number
}

export const hexKey = (h: Hex) => `${h.q},${h.r}`

export const HEX_DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export const neighbors = (h: Hex): Hex[] => HEX_DIRS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }))

export const hexDistance = (a: Hex, b: Hex) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2

export function hexesInRadius(radius: number): Hex[] {
  const out: Hex[] = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push({ q, r })
  }
  return out
}

/** World-space centre of a hex on the XZ plane. */
export function hexToWorld(h: Hex, size = 1): [number, number] {
  return [size * Math.sqrt(3) * (h.q + h.r / 2), size * 1.5 * h.r]
}
