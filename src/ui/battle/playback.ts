/**
 * Turning a CombatResult into poses at any (fractional) tick: where each unit
 * stands, mid-step, what it's swinging at. Pure functions over precomputed
 * per-unit timelines, so the renderer can scrub backwards as well as play.
 */
import { CONFIG, F, FRAME_STRIDE, arena, hexToWorld, type AbilityId, type CombatEvent, type CombatResult } from '../../game'

/** World distance between neighbouring cell centres is √3 × this. */
export const CELL = 1

export const TPS = CONFIG.combat.ticksPerSecond

type MoveEv = Extract<CombatEvent, { kind: 'move' }>
type ActEv = { t: number; lands: number; to: number; kind: 'attack' | 'heal' | 'hex' | 'cast'; ability?: AbilityId }

export interface Timeline {
  result: CombatResult
  /** World XZ per arena cell. */
  cellXZ: [number, number][]
  moves: MoveEv[][]
  acts: ActEv[][]
  hitsTaken: number[][]
  deaths: (number | null)[]
}

export function buildTimeline(result: CombatResult): Timeline {
  const A = arena(result.arenaRadius)
  const n = result.roster.length
  const tl: Timeline = {
    result,
    cellXZ: A.cells.map((h) => hexToWorld(h, CELL)),
    moves: Array.from({ length: n }, () => []),
    acts: Array.from({ length: n }, () => []),
    hitsTaken: Array.from({ length: n }, () => []),
    deaths: Array(n).fill(null),
  }
  for (const e of result.events) {
    if (e.kind === 'move') tl.moves[e.id]!.push(e)
    else if (e.kind === 'attack') tl.acts[e.id]!.push({ t: e.t, lands: e.lands, to: e.to, kind: e.heal ? 'heal' : e.hex ? 'hex' : 'attack' })
    else if (e.kind === 'cast') tl.acts[e.id]!.push({ t: e.t, lands: e.lands, to: e.to, kind: 'cast', ability: e.ability })
    else if (e.kind === 'hit') tl.hitsTaken[e.to]!.push(e.t)
    else if (e.kind === 'death') tl.deaths[e.id] = e.t
  }
  return tl
}

/** Last item with `.t ≤ tick`, or undefined. Items must be sorted by t. */
export function lastAt<T extends { t: number }>(items: readonly T[], tick: number): T | undefined {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid]!.t <= tick) lo = mid + 1
    else hi = mid
  }
  return items[lo - 1]
}

const ease = (p: number) => p * p * (3 - 2 * p)

export interface Pose {
  x: number
  z: number
  /** Height of the step hop. */
  hop: number
  /** 0..1 progress through a step, or −1 when standing. */
  stepping: number
}

/** Where a unit is at a fractional tick. */
export function poseAt(tl: Timeline, id: number, tick: number): Pose {
  const mv = lastAt(tl.moves[id]!, tick)
  if (!mv) {
    const [x, z] = tl.cellXZ[tl.result.roster[id]!.startCell]!
    return { x, z, hop: 0, stepping: -1 }
  }
  const p = (tick - mv.t) / mv.ticks
  const [tx, tz] = tl.cellXZ[mv.to]!
  if (p >= 1) return { x: tx, z: tz, hop: 0, stepping: -1 }
  const [fx, fz] = tl.cellXZ[mv.from]!
  const e = ease(Math.max(0, p))
  return { x: fx + (tx - fx) * e, z: fz + (tz - fz) * e, hop: Math.sin(Math.PI * p) * 0.14, stepping: p }
}

/** The action a unit is in the middle of (swing/cast), with its phase. */
export function actionAt(tl: Timeline, id: number, tick: number) {
  const a = lastAt(tl.acts[id]!, tick)
  if (!a) return null
  const windup = Math.max(0.5, a.lands - a.t)
  const since = tick - a.t
  // Windup (0→1), then a short follow-through (1→2) after it lands.
  const phase = since <= windup ? since / windup : 1 + (since - windup) / 3
  if (phase > 2) return null
  return { ...a, phase }
}

/** Frame values for a unit at a whole tick. */
export function frameAt(result: CombatResult, tick: number) {
  const f = result.frames[Math.max(0, Math.min(result.ticks, Math.floor(tick)))]!
  return (id: number, k: keyof typeof F) => f[id * FRAME_STRIDE + F[k]]!
}
