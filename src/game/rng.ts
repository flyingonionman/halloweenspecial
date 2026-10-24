/**
 * Seeded PRNG (mulberry32). Every random decision in the game goes through one
 * of these so a run is fully reproducible from its seed — combat replays and
 * AI opponents depend on that.
 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array')
    return items[Math.floor(this.next() * items.length)]!
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((sum, it) => sum + Math.max(0, weight(it)), 0)
    if (total <= 0) return this.pick(items)
    let roll = this.next() * total
    for (const it of items) {
      roll -= Math.max(0, weight(it))
      if (roll < 0) return it
    }
    return items[items.length - 1]!
  }

  /** Derive an independent seed (e.g. for a combat sim) without disturbing callers' sequences much. */
  fork(): number {
    return Math.floor(this.next() * 4294967296) >>> 0
  }
}
