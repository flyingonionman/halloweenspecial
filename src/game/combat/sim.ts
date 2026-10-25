/**
 * CombatUnit is a unit's transient state inside one fight.
 *
 * The sim is a fixed-timestep, seeded, renderer-agnostic function: two sides
 * in, a full timeline out. Renderers just play the frames back, so the same
 * result can be drawn in 2D, 3D, or not at all (tests, AI-vs-AI balancing).
 */
import { CONFIG, type Rarity } from '../config'
import { Rng } from '../rng'
import { TYPE_DEFS, isRanged, type AbilityId, type DamageKind, type UnitType } from '../units/types'
import type { Unit } from '../units/unit'
import type { AffinityPoints } from '../affinities'
import type { TeamBonuses } from '../world/city'
import { combatStats, computeSynergies, type CombatStats } from '../synergy'

export type Team = 0 | 1

export interface CombatSide {
  units: readonly Unit[]
  bonuses?: TeamBonuses
}

export interface CombatUnit {
  id: number
  team: Team
  unit: Unit
  stats: CombatStats
  hp: number
  shield: number
  energy: number
  x: number
  y: number
  cooldown: number
  targetId: number | null
  alive: boolean
  slow: number
  slowUntil: number
}

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
}

/** Values per unit in a frame, in roster order: x, y, hp, shield, energy. */
export const FRAME_STRIDE = 5

export type CombatEvent =
  | { t: number; kind: 'attack'; from: number; to: number; amount: number; crit: boolean; damage: DamageKind }
  | { t: number; kind: 'ability'; from: number; ability: AbilityId; targets: number[] }
  | { t: number; kind: 'heal'; from: number; to: number; amount: number }
  | { t: number; kind: 'death'; id: number }

export interface CombatResult {
  seed: number
  winner: Team | 'draw'
  duration: number
  tick: number
  roster: RosterEntry[]
  frames: Float32Array[]
  events: CombatEvent[]
  survivors: [string[], string[]]
}

const { tick: DT, fieldWidth: W, fieldHeight: H } = CONFIG.combat

function deploy(side: CombatSide, team: Team, firstId: number): CombatUnit[] {
  const synergies = computeSynergies(side.units, side.bonuses?.affinityLevels)
  const melee = side.units.filter((u) => !isRanged(u.type))
  const ranged = side.units.filter((u) => isRanged(u.type))
  const dir = team === 0 ? -1 : 1
  const out: CombatUnit[] = []
  const line = (group: Unit[], depth: number) =>
    group.forEach((unit, i) => {
      const stats = combatStats(unit, synergies, side.bonuses)
      out.push({
        id: firstId + out.length,
        team,
        unit,
        stats,
        hp: stats.hp,
        shield: stats.hp * stats.startShield,
        energy: 0,
        x: W / 2 + dir * depth,
        y: H / 2 + (i - (group.length - 1) / 2) * 1.6,
        cooldown: 0,
        targetId: null,
        alive: true,
        slow: 0,
        slowUntil: 0,
      })
    })
  line(melee, 4)
  line(ranged, 8)
  return out
}

export function simulateCombat(sideA: CombatSide, sideB: CombatSide, seed: number): CombatResult {
  const rng = new Rng(seed)
  const a = deploy(sideA, 0, 0)
  const units = [...a, ...deploy(sideB, 1, a.length)]
  const events: CombatEvent[] = []
  const frames: Float32Array[] = []
  let t = 0

  const dist = (p: CombatUnit, q: CombatUnit) => Math.hypot(p.x - q.x, p.y - q.y)
  const enemiesOf = (u: CombatUnit) => units.filter((o) => o.alive && o.team !== u.team)
  const alliesOf = (u: CombatUnit) => units.filter((o) => o.alive && o.team === u.team)
  const slowFactor = (u: CombatUnit) => (t < u.slowUntil ? 1 - u.slow : 1)

  const nearest = (u: CombatUnit, pool: CombatUnit[]) => {
    let best: CombatUnit | null = null
    let bestD = Infinity
    for (const o of pool) {
      const d = dist(u, o)
      if (d < bestD) [best, bestD] = [o, d]
    }
    return best
  }

  const record = () => {
    const f = new Float32Array(units.length * FRAME_STRIDE)
    units.forEach((u, i) => f.set([u.x, u.y, u.hp, u.shield, u.energy], i * FRAME_STRIDE))
    frames.push(f)
  }

  const gainEnergy = (u: CombatUnit, amount: number) => {
    u.energy = Math.min(u.stats.maxEnergy, u.energy + amount * u.stats.energyGain)
  }

  const heal = (src: CombatUnit, tgt: CombatUnit, amount: number) => {
    const healed = Math.min(tgt.stats.hp - tgt.hp, amount)
    if (healed <= 0) return
    tgt.hp += healed
    events.push({ t, kind: 'heal', from: src.id, to: tgt.id, amount: Math.round(healed) })
  }

  /** Applies mitigation, shields, death. `onHit` triggers lifesteal/slow/thorns (not for reflected damage). */
  const damage = (src: CombatUnit, tgt: CombatUnit, raw: number, kind: DamageKind, crit = false, onHit = true): number => {
    if (!tgt.alive) return 0
    const def = kind === 'magic' ? tgt.stats.def * CONFIG.combat.magicDefFactor : tgt.stats.def
    let amount = raw * (100 / (100 + def)) * (1 - tgt.stats.damageReduction) * (crit ? 2 : 1)
    const absorbed = Math.min(tgt.shield, amount)
    tgt.shield -= absorbed
    tgt.hp -= amount - absorbed
    gainEnergy(tgt, CONFIG.combat.energyPerHit)
    events.push({ t, kind: 'attack', from: src.id, to: tgt.id, amount: Math.round(amount), crit, damage: kind })

    if (onHit) {
      if (src.stats.lifesteal > 0 && src.alive) heal(src, src, amount * src.stats.lifesteal)
      if (src.stats.slowOnHit > 0) {
        tgt.slow = Math.max(tgt.slowUntil > t ? tgt.slow : 0, src.stats.slowOnHit)
        tgt.slowUntil = t + CONFIG.combat.slowSeconds
      }
      if (tgt.stats.thorns > 0 && src.alive) damage(tgt, src, amount * tgt.stats.thorns, 'magic', false, false)
    }

    if (tgt.hp <= 0) {
      tgt.hp = 0
      tgt.alive = false
      events.push({ t, kind: 'death', id: tgt.id })
    }
    amount = Math.round(amount)
    return amount
  }

  const basicAttack = (u: CombatUnit, target: CombatUnit) => {
    const crit = rng.chance(u.stats.critChance)
    damage(u, target, u.stats.atk, u.stats.damage, crit)
    if (u.stats.bonusMagic > 0 && target.alive) damage(u, target, u.stats.atk * u.stats.bonusMagic, 'magic', false, false)
  }

  const cast = (u: CombatUnit, target: CombatUnit) => {
    const ability = TYPE_DEFS[u.unit.type].ability
    const power = u.stats.atk * u.stats.spellPower
    const kind = u.stats.damage
    const hit: number[] = []
    switch (ability) {
      case 'cleave':
        damage(u, target, power * 1.7, kind)
        hit.push(target.id)
        for (const e of enemiesOf(u)) {
          if (e !== target && dist(e, target) <= 1.6) {
            damage(u, e, power, kind)
            hit.push(e.id)
          }
        }
        break
      case 'taunt':
        u.shield += u.stats.hp * 0.25 * u.stats.spellPower
        for (const e of enemiesOf(u)) {
          if (dist(e, u) <= 4) {
            e.targetId = u.id
            hit.push(e.id)
          }
        }
        break
      case 'blast':
        for (const e of enemiesOf(u)) {
          if (dist(e, target) <= 2) {
            damage(u, e, power * 1.8, kind)
            hit.push(e.id)
          }
        }
        break
      case 'volley':
        for (const e of enemiesOf(u).sort((p, q) => dist(u, p) - dist(u, q)).slice(0, 3)) {
          damage(u, e, power * 1.3, kind)
          hit.push(e.id)
        }
        break
      case 'mend': {
        const ally = alliesOf(u).sort((p, q) => p.hp / p.stats.hp - q.hp / q.stats.hp)[0]
        if (ally) {
          heal(u, ally, ally.stats.hp * 0.18 * u.stats.spellPower + power * 1.5)
          hit.push(ally.id)
        }
        break
      }
    }
    events.push({ t, kind: 'ability', from: u.id, ability, targets: hit })
  }

  const act = (u: CombatUnit) => {
    const slow = slowFactor(u)
    u.cooldown -= DT * slow
    let target = u.targetId === null ? null : units[u.targetId]!
    if (!target?.alive) {
      target = nearest(u, enemiesOf(u))
      u.targetId = target?.id ?? null
    }
    if (!target) return

    const d = dist(u, target)
    if (d > u.stats.range) {
      const step = Math.min(u.stats.moveSpeed * slow * DT, d - u.stats.range + 0.01)
      u.x += ((target.x - u.x) / d) * step
      u.y += ((target.y - u.y) / d) * step
    } else if (u.cooldown <= 0) {
      basicAttack(u, target)
      gainEnergy(u, CONFIG.combat.energyPerAttack)
      u.cooldown = rng.chance(u.stats.doubleStrike) ? 0.15 : 1 / u.stats.atkSpeed
    }

    if (u.alive && u.energy >= u.stats.maxEnergy && target.alive) {
      u.energy = 0
      cast(u, target)
    }
  }

  const separate = () => {
    const r = CONFIG.combat.separationRadius
    for (let i = 0; i < units.length; i++) {
      const p = units[i]!
      if (!p.alive) continue
      for (let j = i + 1; j < units.length; j++) {
        const q = units[j]!
        if (!q.alive) continue
        let dx = q.x - p.x
        let dy = q.y - p.y
        let d = Math.hypot(dx, dy)
        if (d >= r) continue
        if (d < 1e-6) [dx, dy, d] = [0, 1, 1]
        const push = (r - d) / 2
        p.x -= (dx / d) * push
        p.y -= (dy / d) * push
        q.x += (dx / d) * push
        q.y += (dy / d) * push
      }
    }
    for (const u of units) {
      u.x = Math.min(W - 0.5, Math.max(0.5, u.x))
      u.y = Math.min(H - 0.5, Math.max(0.5, u.y))
    }
  }

  const teamAlive = (team: Team) => units.some((u) => u.alive && u.team === team)

  record()
  const maxTicks = Math.ceil(CONFIG.combat.maxSeconds / DT)
  let tickN = 0
  while (tickN < maxTicks && teamAlive(0) && teamAlive(1)) {
    tickN++
    t = tickN * DT
    for (const u of units) if (u.alive) act(u)
    separate()
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
    duration: t,
    tick: DT,
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
    })),
    frames,
    events,
    survivors: [
      units.filter((u) => u.alive && u.team === 0).map((u) => u.unit.uid),
      units.filter((u) => u.alive && u.team === 1).map((u) => u.unit.uid),
    ],
  }
}
