/**
 * Reading a CombatResult: per-unit tallies (damage, healing, kills…) up to any
 * tick, what each unit is doing on a tick, and a plain-text combat log. Shared
 * by the battle HUD, the sandbox and the `npm run sim` CLI.
 */
import { TYPE_DEFS } from '../units/types'
import { arena } from './arena'
import { F, FLAG, FRAME_STRIDE, type CombatEvent, type CombatResult } from './sim'

export interface Tally {
  dealt: number
  taken: number
  /** Damage soaked by shields. */
  absorbed: number
  healed: number
  kills: number
  attacks: number
  casts: number
  steps: number
  /** Tick of death, or null. */
  diedAt: number | null
}

const empty = (): Tally => ({ dealt: 0, taken: 0, absorbed: 0, healed: 0, kills: 0, attacks: 0, casts: 0, steps: 0, diedAt: null })

/** Tallies for every roster unit, counting events on ticks ≤ `upTo` (all by default). */
export function tally(result: CombatResult, upTo = Infinity): Tally[] {
  const out = result.roster.map(empty)
  for (const e of result.events) {
    if (e.t > upTo) break
    switch (e.kind) {
      case 'hit':
        out[e.from]!.dealt += e.amount
        out[e.to]!.taken += e.amount
        out[e.to]!.absorbed += e.absorbed
        break
      case 'heal':
        out[e.from]!.healed += e.amount
        break
      case 'attack':
        out[e.id]!.attacks++
        break
      case 'cast':
        out[e.id]!.casts++
        break
      case 'move':
        out[e.id]!.steps++
        break
      case 'death':
        out[e.id]!.diedAt = e.t
        if (result.roster[e.by]!.team !== result.roster[e.id]!.team) out[e.by]!.kills++
        break
    }
  }
  return out
}

/** Index of the first event on a tick > `tick` (events are in tick order). */
export function eventsUntil(result: CombatResult, tick: number): number {
  let lo = 0
  let hi = result.events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (result.events[mid]!.t <= tick) lo = mid + 1
    else hi = mid
  }
  return lo
}

export const cellLabel = (result: CombatResult, cell: number) => {
  const h = arena(result.arenaRadius).cells[cell]!
  return `(${h.q},${h.r})`
}

/** A unit's short name in the log; enemies (team 1) are starred. */
export function who(r: CombatResult, id: number) {
  const name = r.roster[id]!.name
  return `${name.length <= 14 ? name : name.split(' ')[0]}${r.roster[id]!.team === 0 ? '' : '*'}`
}

/** One line of the log for an event, or null for noise (target switches are kept). */
export function describe(result: CombatResult, e: CombatEvent): string | null {
  const n = (id: number) => who(result, id)
  switch (e.kind) {
    case 'move':
      return `${n(e.id)} steps ${cellLabel(result, e.from)} → ${cellLabel(result, e.to)} (${e.ticks} ticks)`
    case 'attack':
      return `${n(e.id)} ${e.heal ? 'mends' : e.hex ? 'hexes' : 'attacks'} ${n(e.to)}, lands t${e.lands}`
    case 'cast':
      return `${n(e.id)} casts ${TYPE_DEFS[result.roster[e.id]!.type].abilityLabel} at ${n(e.to)}, lands t${e.lands}`
    case 'skill':
      return `${n(e.id)}'s ${e.ability} touches ${e.targets.map(n).join(', ') || 'nobody'}`
    case 'hit':
      return `${n(e.from)} → ${n(e.to)} ${e.amount}${e.crit ? ' CRIT' : ''} ${e.damage}${e.source !== 'attack' ? ` (${e.source})` : ''}${e.absorbed ? `, ${e.absorbed} shielded` : ''}`
    case 'heal':
      return `${n(e.from)} heals ${n(e.to)} +${e.amount}${e.source !== 'attack' ? ` (${e.source})` : ''}`
    case 'shield':
      return `${n(e.id)} shields itself +${e.amount}`
    case 'status':
      return `${n(e.id)} is ${e.status} by ${n(e.by)} until t${e.until}`
    case 'target':
      return `${n(e.id)} targets ${n(e.to)} (${e.reason})`
    case 'death':
      return `☠ ${n(e.id)} falls to ${n(e.by)}`
  }
}

/** What a unit is doing on a tick, in words (for the inspector). */
export function activity(result: CombatResult, id: number, tick: number): string {
  const f = result.frames[Math.min(tick, result.ticks)]!
  if (f[id * FRAME_STRIDE + F.hp]! <= 0) return 'Fallen'
  // The latest action event of this unit that is still running.
  for (let i = eventsUntil(result, tick) - 1; i >= 0; i--) {
    const e = result.events[i]!
    if (tick - e.t > 40) break
    if (e.kind === 'move' && e.id === id && tick < e.t + e.ticks) return `Stepping to ${cellLabel(result, e.to)} (${tick - e.t + 1}/${e.ticks})`
    if (e.kind === 'cast' && e.id === id && tick <= e.lands) return `Casting ${TYPE_DEFS[result.roster[id]!.type].abilityLabel} (lands t${e.lands})`
    if (e.kind === 'attack' && e.id === id && tick < e.t + result.roster[id]!.attackTicks) {
      const verb = e.heal ? 'Mending' : e.hex ? 'Hexing' : 'Attacking'
      return `${verb} ${who(result, e.to)}${tick <= e.lands ? ` (lands t${e.lands})` : ' (recovering)'}`
    }
  }
  const flags = f[id * FRAME_STRIDE + F.flags]!
  return flags & FLAG.busy ? 'Busy' : 'Ready'
}

/** The whole fight as text: header, optional per-tick log, then a scoreboard. */
export function formatCombat(result: CombatResult, opts: { log?: boolean; moves?: boolean } = {}): string {
  const lines: string[] = []
  const tps = Math.round(1 / result.tick)
  lines.push(`seed ${result.seed} · ${result.ticks} ticks (${result.duration.toFixed(1)}s at ${tps}/s) · winner: ${result.winner === 'draw' ? 'draw' : `team ${result.winner}`}`)
  if (opts.log) {
    for (const e of result.events) {
      if (e.kind === 'move' && !opts.moves) continue
      const d = describe(result, e)
      if (d) lines.push(`t${String(e.t).padStart(3, '0')}  ${d}`)
    }
  }
  const tl = tally(result)
  const row = (cells: (string | number)[]) => cells.map((c, i) => String(c)[i < 2 ? 'padEnd' : 'padStart'](i === 0 ? 22 : i === 1 ? 9 : 7)).join(' ')
  lines.push('')
  lines.push(row(['unit', 'type', 'dealt', 'taken', 'healed', 'kills', 'casts', 'died']))
  for (const r of result.roster) {
    const x = tl[r.id]!
    lines.push(
      row([
        `${r.team === 0 ? 'A' : 'B'} ${r.name}`.slice(0, 22),
        r.type,
        x.dealt,
        x.taken,
        x.healed,
        x.kills,
        x.casts,
        x.diedAt === null ? '-' : `t${x.diedAt}`,
      ]),
    )
  }
  return lines.join('\n')
}
