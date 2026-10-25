/**
 * The combat sim: deterministic, seeded, tick based, renderer-agnostic. Two
 * sides in, a full timeline out (a frame per tick plus an event log), so the
 * same fight can be replayed in 3D, scrubbed tick by tick in the debugger,
 * printed as text, or never drawn at all (tests, balancing).
 *
 * The cadence, every tick:
 *   1. effects that were wound up earlier land (hits, heals, skills);
 *   2. every unit that isn't busy picks an action, in roster order. Each action
 *      occupies the unit for whole ticks: a step to the next cell
 *      (`moveTicks`), an attack (`attackTicks`, landing part way through), a
 *      skill (`castTicks`). Slows stretch those durations;
 *   3. the frame is recorded.
 *
 * Targeting: tanks grab aggro. Fighters, rangers and mages attack enemy tanks
 * first (any tank they can reach) and only then whoever is nearest. Tanks
 * fight the nearest enemy, and Taunt locks nearby enemies onto them. Healers
 * heal the most hurt ally in reach and otherwise hex the strongest enemy.
 */
import { CONFIG, type Rarity } from '../config'
import { Rng } from '../rng'
import { TYPE_DEFS, attackTicks, isRanged, moveTicks, type AbilityId, type DamageKind, type UnitType } from '../units/types'
import type { Unit } from '../units/unit'
import type { AffinityPoints } from '../affinities'
import type { TeamBonuses } from '../world/city'
import { combatStats, computeSynergies, type CombatStats } from '../synergy'
import { BACK_COLUMNS, FRONT_COLUMNS, arena, cellDistance, columnSlots } from './arena'

export type Team = 0 | 1

export interface CombatSide {
  units: readonly Unit[]
  bonuses?: TeamBonuses
}

/** Why a unit picked its target (the debugger shows this). */
export type TargetReason = 'tank' | 'nearest' | 'taunt' | 'heal' | 'hex'

export interface RosterEntry {
  id: number
  team: Team
  uid: string
  name: string
  type: UnitType
  affinities: AffinityPoints
  rarity: Rarity
  level: number
  maxHp: number
  maxEnergy: number
  stats: CombatStats
  /** Ticks per attack and per step, before slows. */
  attackTicks: number
  moveTicks: number
  startCell: number
}

/** Values per unit per tick, in roster order (see `F`). */
export const FRAME_STRIDE = 6
/** Offsets into a unit's slice of a frame. `target` is a roster id or −1. */
export const F = { cell: 0, hp: 1, shield: 2, energy: 3, target: 4, flags: 5 } as const
export const FLAG = { slowed: 1, weakened: 2, taunted: 4, busy: 8 } as const

export type HitSource = 'attack' | 'skill' | 'hex' | 'chain' | 'magic' | 'thorns'
export type StatusId = 'taunted' | 'slowed' | 'weakened'

/** Every event's `t` is the tick it happened on. */
export type CombatEvent =
  /** A step into the next cell (the cell is taken at once; the walk takes `ticks`). */
  | { t: number; kind: 'move'; id: number; from: number; to: number; ticks: number }
  /** An attack starts its swing / projectile; it lands on tick `lands`. `heal` for a healer's mend-bolt. */
  | { t: number; kind: 'attack'; id: number; to: number; lands: number; heal?: boolean; hex?: boolean }
  /** A skill starts; it takes effect on tick `lands` (then a `skill` event lists who it touched). */
  | { t: number; kind: 'cast'; id: number; ability: AbilityId; to: number; lands: number }
  | { t: number; kind: 'skill'; id: number; ability: AbilityId; targets: number[] }
  | { t: number; kind: 'hit'; from: number; to: number; amount: number; absorbed: number; crit: boolean; damage: DamageKind; source: HitSource }
  | { t: number; kind: 'heal'; from: number; to: number; amount: number; source: 'attack' | 'skill' | 'lifesteal' }
  | { t: number; kind: 'shield'; id: number; amount: number }
  | { t: number; kind: 'status'; id: number; by: number; status: StatusId; until: number }
  | { t: number; kind: 'target'; id: number; to: number; reason: TargetReason }
  | { t: number; kind: 'death'; id: number; by: number }

export interface CombatResult {
  seed: number
  winner: Team | 'draw'
  /** Seconds. */
  duration: number
  /** Seconds per tick. */
  tick: number
  /** Ticks played (frames.length − 1). */
  ticks: number
  arenaRadius: number
  roster: RosterEntry[]
  /** frames[tick]: FRAME_STRIDE values per unit. */
  frames: Float32Array[]
  events: CombatEvent[]
  survivors: [string[], string[]]
}

interface Fighter {
  id: number
  team: Team
  unit: Unit
  type: UnitType
  stats: CombatStats
  hp: number
  shield: number
  energy: number
  cell: number
  /** First tick on which the unit may act again. */
  free: number
  target: number
  alive: boolean
  /** Tick of death (−1 while alive). Blows already in the air on that tick still land. */
  diedAt: number
  tauntBy: number
  tauntUntil: number
  slow: number
  slowUntil: number
  weak: number
  weakUntil: number
  atkTicks: number
  stepTicks: number
}

const C = CONFIG.combat
const INF = 1e9

/** Damage multiplier (and healing divisor) on a tick: 1 until overtime, then +`overtimeRamp` per second. */
export const overtimeMult = (tick: number) => 1 + Math.max(0, tick - C.overtimeAfter) * (C.overtimeRamp / C.ticksPerSecond)

export function simulateCombat(sideA: CombatSide, sideB: CombatSide, seed: number): CombatResult {
  const rng = new Rng(seed)
  const A = arena()
  const occ = new Int16Array(A.cells.length).fill(-1)
  const units: Fighter[] = []
  const events: CombatEvent[] = []
  const frames: Float32Array[] = []
  let pending: { at: number; run: () => void }[] = []
  let t = 0

  // ── Deployment: melee on the front columns (tanks in the middle), ranged behind.
  const deploy = (side: CombatSide, team: Team) => {
    const synergies = computeSynergies(side.units, side.bonuses?.affinityLevels)
    const rank: Record<UnitType, number> = { tank: 0, fighter: 1, healer: 0, mage: 1, ranger: 2 }
    const byRank = (us: Unit[]) => us.map((u, i) => [u, i] as const).sort((a, b) => rank[a[0].type] - rank[b[0].type] || a[1] - b[1]).map(([u]) => u)
    const place = (group: Unit[], columns: readonly number[]) => {
      const slots = columns.flatMap((c) => columnSlots(A, team, c))
      for (const unit of group) {
        const cell = slots.find((c) => occ[c] === -1)
        if (cell === undefined) continue // more units than the arena holds: they sit this one out
        const stats = combatStats(unit, synergies, side.bonuses)
        const f: Fighter = {
          id: units.length,
          team,
          unit,
          type: unit.type,
          stats,
          hp: stats.hp,
          shield: stats.hp * stats.startShield,
          energy: 0,
          cell,
          free: 1,
          target: -1,
          alive: true,
          diedAt: -1,
          tauntBy: -1,
          tauntUntil: 0,
          slow: 0,
          slowUntil: 0,
          weak: 0,
          weakUntil: 0,
          atkTicks: attackTicks(stats.atkSpeed),
          stepTicks: moveTicks(stats.moveSpeed),
        }
        occ[cell] = f.id
        units.push(f)
      }
    }
    place(byRank(side.units.filter((u) => !isRanged(u.type))), FRONT_COLUMNS)
    place(byRank(side.units.filter((u) => isRanged(u.type))), BACK_COLUMNS)
  }
  deploy(sideA, 0)
  deploy(sideB, 1)
  const startCells = units.map((u) => u.cell)

  // ── Helpers
  const dist = (p: Fighter, q: Fighter) => cellDistance(A, p.cell, q.cell)
  const enemiesOf = (u: Fighter) => units.filter((o) => o.alive && o.team !== u.team)
  const alliesOf = (u: Fighter) => units.filter((o) => o.alive && o.team === u.team)
  const slowed = (u: Fighter) => t < u.slowUntil
  /** An action's ticks, stretched while slowed. */
  const dur = (u: Fighter, ticks: number) => (slowed(u) ? Math.round(ticks / (1 - u.slow)) : ticks)
  const schedule = (at: number, run: () => void) => pending.push({ at, run })
  const hpFrac = (u: Fighter) => u.hp / u.stats.hp
  /** Overtime: past `overtimeAfter` ticks, damage ramps up and healing ramps down, so stalls end. */
  const overtime = () => overtimeMult(t)
  /** Alive, or fell this very tick: two units that trade lethal blows on the same tick both land them. */
  const active = (u: Fighter) => u.alive || u.diedAt === t

  const gainEnergy = (u: Fighter, amount: number) => {
    u.energy = Math.min(u.stats.maxEnergy, u.energy + amount * u.stats.energyGain)
  }

  const setTarget = (u: Fighter, to: Fighter, reason: TargetReason) => {
    if (u.target === to.id) return
    u.target = to.id
    events.push({ t, kind: 'target', id: u.id, to: to.id, reason })
  }

  const status = (tgt: Fighter, by: Fighter, s: StatusId, until: number) => events.push({ t, kind: 'status', id: tgt.id, by: by.id, status: s, until })

  const heal = (src: Fighter, tgt: Fighter, amount: number, source: 'attack' | 'skill' | 'lifesteal') => {
    if (!tgt.alive) return
    const healed = Math.min(tgt.stats.hp - tgt.hp, amount / overtime())
    if (healed <= 0) return
    tgt.hp += healed
    events.push({ t, kind: 'heal', from: src.id, to: tgt.id, amount: Math.round(healed), source })
  }

  /** Mitigation, shields, on-hit effects, death. Reflected/secondary damage passes onHit = false. */
  const damage = (src: Fighter, tgt: Fighter, raw: number, kind: DamageKind, source: HitSource, crit = false, onHit = true) => {
    if (!tgt.alive) return
    const def = kind === 'magic' ? tgt.stats.def * C.magicDefFactor : tgt.stats.def
    const weak = t < src.weakUntil ? 1 - src.weak : 1
    const amount = raw * weak * overtime() * (100 / (100 + def)) * (1 - tgt.stats.damageReduction) * (crit ? 2 : 1)
    const absorbed = Math.min(tgt.shield, amount)
    tgt.shield -= absorbed
    tgt.hp -= amount - absorbed
    gainEnergy(tgt, C.energyPerHit)
    events.push({ t, kind: 'hit', from: src.id, to: tgt.id, amount: Math.round(amount), absorbed: Math.round(absorbed), crit, damage: kind, source })

    if (onHit) {
      if (src.stats.lifesteal > 0 && src.alive) heal(src, src, amount * src.stats.lifesteal, 'lifesteal')
      if (src.stats.slowOnHit > 0 && tgt.hp > 0) {
        tgt.slow = Math.max(slowed(tgt) ? tgt.slow : 0, src.stats.slowOnHit)
        tgt.slowUntil = t + C.slowTicks
        status(tgt, src, 'slowed', tgt.slowUntil)
      }
      if (tgt.stats.thorns > 0 && src.alive && tgt.hp > 0) damage(tgt, src, amount * tgt.stats.thorns, 'magic', 'thorns', false, false)
    }

    if (tgt.hp <= 0) {
      tgt.hp = 0
      tgt.alive = false
      tgt.diedAt = t
      occ[tgt.cell] = -1
      events.push({ t, kind: 'death', id: tgt.id, by: src.id })
    }
  }

  // ── Pathing: breadth-first over free cells. Team 1 explores in mirrored direction order, so
  // a mirror match plays out as a mirror image.
  const bfs = (u: Fighter) => {
    const d = new Int16Array(A.cells.length).fill(-1)
    const parent = new Int16Array(A.cells.length).fill(-1)
    const queue = [u.cell]
    const off = u.team === 0 ? 0 : 3
    d[u.cell] = 0
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi]!
      for (let k = 0; k < 6; k++) {
        const n = A.adj[c]![(k + off) % 6]!
        if (n === -1 || d[n] !== -1 || occ[n] !== -1) continue
        d[n] = d[c]! + 1
        parent[n] = c
        queue.push(n)
      }
    }
    return { d, parent, reached: queue }
  }

  /** Steps needed before `goal` is within `range` (0 = already), per goal; INF if no way through. */
  const reachCosts = (u: Fighter, goals: Fighter[], range: number) => {
    const { reached, d } = bfs(u)
    return goals.map((g) => {
      if (dist(u, g) <= range) return 0
      let best = INF
      for (const c of reached) if (d[c]! < best && cellDistance(A, c, g.cell) <= range) best = d[c]!
      return best
    })
  }

  /** Take one step toward being within `range` of `goal`. False if there's no way through. */
  const step = (u: Fighter, goal: Fighter, range: number) => {
    const { reached, d, parent } = bfs(u)
    let best = -1
    let bestKey = INF
    for (const c of reached) {
      const gd = cellDistance(A, c, goal.cell)
      if (gd > range || c === u.cell) continue
      // Fewest steps; then hug the goal (melee wraps around it); then cell order.
      const key = d[c]! * 1000 + gd * 10
      if (key < bestKey) [best, bestKey] = [c, key]
    }
    if (best === -1) return false
    let next = best
    while (parent[next] !== u.cell) next = parent[next]!
    const from = u.cell
    occ[from] = -1
    occ[next] = u.id
    u.cell = next
    const ticks = dur(u, u.stepTicks)
    events.push({ t, kind: 'move', id: u.id, from, to: next, ticks })
    u.free = t + ticks
    return true
  }

  // ── Targeting
  const pickTarget = (u: Fighter): Fighter | null => {
    const taunter = units[u.tauntBy]
    if (taunter?.alive && t < u.tauntUntil) {
      setTarget(u, taunter, 'taunt')
      return taunter
    }
    const enemies = enemiesOf(u)
    if (!enemies.length) return null
    const costs = reachCosts(u, enemies, u.stats.range)
    const reachable = enemies.map((e, i) => [e, costs[i]!] as const).filter(([, c]) => c < INF)
    // Tanks grab aggro: everyone but tanks goes for a reachable enemy tank first.
    const tanks = u.type === 'tank' ? [] : reachable.filter(([e]) => e.type === 'tank')
    const pool = tanks.length ? tanks : reachable
    if (!pool.length) return null
    const reason: TargetReason = tanks.length ? 'tank' : 'nearest'
    let [best, bestCost] = pool[0]!
    for (const [e, c] of pool) if (c < bestCost) [best, bestCost] = [e, c]
    // Sticky: keep the current target unless something is clearly closer.
    const cur = pool.find(([e]) => e.id === u.target)
    if (cur && cur[1] <= bestCost + 2) return cur[0]
    setTarget(u, best, reason)
    return best
  }

  // ── Actions
  const windupOf = (total: number) => Math.min(C.maxWindup, Math.max(1, Math.round(total * C.windup)))

  const basicHit = (u: Fighter, target: Fighter) => {
    const crit = rng.chance(u.stats.critChance)
    damage(u, target, u.stats.atk, u.stats.damage, 'attack', crit)
    if (u.stats.bonusMagic > 0 && target.alive) damage(u, target, u.stats.atk * u.stats.bonusMagic, 'magic', 'magic', false, false)
    // Thunder: the blow arcs to the nearest other enemy within 2 cells of the target.
    if (u.stats.chain > 0) {
      const arc = enemiesOf(u)
        .filter((e) => e !== target && cellDistance(A, e.cell, target.cell) <= 2)
        .sort((p, q) => cellDistance(A, p.cell, target.cell) - cellDistance(A, q.cell, target.cell) || p.id - q.id)[0]
      if (arc) damage(u, arc, u.stats.atk * u.stats.chain, 'magic', 'chain', false, false)
    }
  }

  const attack = (u: Fighter, target: Fighter, kind: 'hit' | 'heal' | 'hex' = 'hit') => {
    const total = dur(u, u.atkTicks)
    const w = windupOf(total)
    events.push({ t, kind: 'attack', id: u.id, to: target.id, lands: t + w, ...(kind === 'heal' ? { heal: true } : kind === 'hex' ? { hex: true } : {}) })
    schedule(t + w, () => {
      if (!active(u) || !target.alive) return
      if (kind === 'heal') heal(u, target, u.stats.atk * C.healPower, 'attack')
      else if (kind === 'hex') {
        damage(u, target, u.stats.atk * C.hexDamage, 'magic', 'hex')
        if (target.alive) {
          target.weak = C.weaken
          target.weakUntil = t + C.weakenTicks
          status(target, u, 'weakened', target.weakUntil)
        }
      } else basicHit(u, target)
      gainEnergy(u, C.energyPerAttack)
    })
    u.free = t + (kind === 'hit' && rng.chance(u.stats.doubleStrike) ? w + 1 : total)
  }

  const cast = (u: Fighter, target: Fighter) => {
    const ability = TYPE_DEFS[u.type].ability
    u.energy = 0
    events.push({ t, kind: 'cast', id: u.id, ability, to: target.id, lands: t + C.castWindup })
    schedule(t + C.castWindup, () => {
      if (!active(u)) return
      const power = u.stats.atk * u.stats.spellPower
      const kind = u.stats.damage
      const hit: number[] = []
      const strike = (e: Fighter, mult: number) => {
        damage(u, e, power * mult, kind, 'skill')
        hit.push(e.id)
      }
      switch (ability) {
        case 'cleave':
          if (target.alive) strike(target, 1.7)
          for (const e of enemiesOf(u)) if (e !== target && cellDistance(A, e.cell, target.cell) === 1) strike(e, 1)
          break
        case 'blast':
          for (const e of enemiesOf(u)) if (cellDistance(A, e.cell, target.cell) <= 1) strike(e, 1.8)
          break
        case 'volley':
          for (const e of enemiesOf(u)
            .filter((e) => dist(u, e) <= u.stats.range + 1)
            .sort((p, q) => dist(u, p) - dist(u, q) || p.id - q.id)
            .slice(0, 3))
            strike(e, 1.3)
          break
        case 'taunt': {
          const amount = u.stats.hp * 0.25 * u.stats.spellPower
          u.shield += amount
          events.push({ t, kind: 'shield', id: u.id, amount: Math.round(amount) })
          for (const e of enemiesOf(u)) {
            // Healers keep healing; taunt only pulls attackers.
            if (dist(u, e) > C.tauntRadius || e.type === 'healer') continue
            e.tauntBy = u.id
            e.tauntUntil = t + C.tauntTicks
            status(e, u, 'taunted', e.tauntUntil)
            setTarget(e, u, 'taunt')
            hit.push(e.id)
          }
          break
        }
        case 'mend': {
          const ally = target.alive && target.team === u.team ? target : alliesOf(u).sort((p, q) => hpFrac(p) - hpFrac(q) || p.id - q.id)[0]
          if (ally) {
            heal(u, ally, ally.stats.hp * 0.18 * u.stats.spellPower + power * 1.5, 'skill')
            hit.push(ally.id)
          }
          break
        }
      }
      events.push({ t, kind: 'skill', id: u.id, ability, targets: hit })
    })
    u.free = t + dur(u, C.castTicks)
  }

  const wait = (u: Fighter) => {
    u.free = t + 1
  }

  const fighterAct = (u: Fighter) => {
    const target = pickTarget(u)
    if (!target) return wait(u)
    if (dist(u, target) <= u.stats.range) {
      if (u.energy >= u.stats.maxEnergy) cast(u, target)
      else attack(u, target)
    } else if (!step(u, target, u.stats.range)) wait(u)
  }

  /** Healers: heal the most hurt ally in reach (Mend when energy is full); go to them if out of reach; otherwise hex. */
  const healerAct = (u: Fighter) => {
    const range = u.stats.range
    const hurt = alliesOf(u)
      .filter((a) => a.hp < a.stats.hp * C.hurtBelow)
      .sort((p, q) => hpFrac(p) - hpFrac(q) || p.id - q.id)
    const near = hurt.find((a) => dist(u, a) <= range)
    if (near) {
      setTarget(u, near, 'heal')
      return u.energy >= u.stats.maxEnergy ? cast(u, near) : attack(u, near, 'heal')
    }
    if (hurt[0]) {
      setTarget(u, hurt[0], 'heal')
      if (step(u, hurt[0], range)) return
    }
    const foes = enemiesOf(u)
    const inReach = foes.filter((e) => dist(u, e) <= range).sort((p, q) => q.stats.atk - p.stats.atk || p.id - q.id)
    if (inReach[0]) {
      setTarget(u, inReach[0], 'hex')
      return attack(u, inReach[0], 'hex')
    }
    if (!foes.length) return wait(u)
    const costs = reachCosts(u, foes, range)
    let best = -1
    for (let i = 0; i < foes.length; i++) if (costs[i]! < INF && (best === -1 || costs[i]! < costs[best]!)) best = i
    if (best === -1) return wait(u)
    setTarget(u, foes[best]!, 'hex')
    if (!step(u, foes[best]!, range)) wait(u)
  }

  const record = () => {
    const f = new Float32Array(units.length * FRAME_STRIDE)
    units.forEach((u, i) => {
      const flags =
        (slowed(u) ? FLAG.slowed : 0) |
        (t < u.weakUntil ? FLAG.weakened : 0) |
        (t < u.tauntUntil && units[u.tauntBy]?.alive ? FLAG.taunted : 0) |
        (u.free > t + 1 ? FLAG.busy : 0)
      f.set([u.cell, u.hp, u.shield, u.energy, u.alive ? u.target : -1, flags], i * FRAME_STRIDE)
    })
    frames.push(f)
  }

  const teamAlive = (team: Team) => units.some((u) => u.alive && u.team === team)

  // Turn order within a tick: the teams take turns unit by unit, and a seeded coin picks which
  // team leads each tick (alternating would favour whichever side's action lengths are even).
  const sides = [units.filter((u) => u.team === 0), units.filter((u) => u.team === 1)]
  const orders = ([0, 1] as const).map((lead) => {
    const out: Fighter[] = []
    for (let i = 0; i < Math.max(sides[0]!.length, sides[1]!.length); i++) {
      for (const team of [lead, 1 - lead]) if (sides[team]![i]) out.push(sides[team]![i]!)
    }
    return out
  })

  record()
  const maxTicks = C.maxSeconds * C.ticksPerSecond
  while (t < maxTicks && teamAlive(0) && teamAlive(1)) {
    t++
    const due = pending.filter((p) => p.at <= t)
    pending = pending.filter((p) => p.at > t)
    for (const p of due) p.run()
    for (const u of orders[rng.chance(0.5) ? 1 : 0]!) {
      if (!u.alive || u.free > t) continue
      if (!teamAlive(u.team === 0 ? 1 : 0)) break
      if (u.type === 'healer') healerAct(u)
      else fighterAct(u)
    }
    record()
  }

  let winner: Team | 'draw'
  if (!teamAlive(1) && teamAlive(0)) winner = 0
  else if (!teamAlive(0) && teamAlive(1)) winner = 1
  else {
    const health = (team: Team) => units.filter((u) => u.team === team).reduce((sum, u) => sum + u.hp / u.stats.hp, 0)
    const [h0, h1] = [health(0), health(1)]
    winner = Math.abs(h0 - h1) < 1e-6 ? 'draw' : h0 > h1 ? 0 : 1
  }

  return {
    seed,
    winner,
    duration: t / C.ticksPerSecond,
    tick: 1 / C.ticksPerSecond,
    ticks: t,
    arenaRadius: A.radius,
    roster: units.map((u) => ({
      id: u.id,
      team: u.team,
      uid: u.unit.uid,
      name: u.unit.name,
      type: u.unit.type,
      affinities: u.unit.affinities,
      rarity: u.unit.rarity,
      level: u.unit.level,
      maxHp: u.stats.hp,
      maxEnergy: u.stats.maxEnergy,
      stats: u.stats,
      attackTicks: u.atkTicks,
      moveTicks: u.stepTicks,
      startCell: startCells[u.id]!,
    })),
    frames,
    events,
    survivors: [
      units.filter((u) => u.alive && u.team === 0).map((u) => u.unit.uid),
      units.filter((u) => u.alive && u.team === 1).map((u) => u.unit.uid),
    ],
  }
}
