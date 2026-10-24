/**
 * Layer 3 of the unit model: CombatUnit, a unit's transient state inside one fight.
 *
 * The sim is a fixed-timestep, seeded, renderer-agnostic function: two troops
 * in, a full timeline out. Renderers just play the frames back, so the same
 * result can be drawn in 2D, 3D, or not at all (tests, AI-vs-AI balancing).
 */
import { CONFIG, type Rarity } from '../config'
import { Rng } from '../rng'
import { CLASS_DEFS, isMelee, type AbilityId, type Element, type UnitClass } from '../units/archetypes'
import { tagsOf, type Unit } from '../units/unit'
import { combatStats, computeSynergies, type CombatStats } from '../synergy'

export type Team = 0 | 1

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
}

export interface RosterEntry {
  id: number
  team: Team
  uid: string
  name: string
  cls: UnitClass
  element: Element
  rarity: Rarity
  level: number
  maxHp: number
  maxEnergy: number
}

/** Values per unit in a frame, in roster order: x, y, hp, shield, energy. */
export const FRAME_STRIDE = 5

export type CombatEvent =
  | { t: number; kind: 'attack'; from: number; to: number; amount: number; crit: boolean }
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

function deploy(troop: readonly Unit[], team: Team, firstId: number): CombatUnit[] {
  const synergies = computeSynergies(troop)
  const melee = troop.filter((u) => isMelee(u.cls))
  const ranged = troop.filter((u) => !isMelee(u.cls))
  const side = team === 0 ? -1 : 1
  const out: CombatUnit[] = []
  const line = (group: Unit[], depth: number) =>
    group.forEach((unit, i) => {
      const stats = combatStats(unit, synergies)
      out.push({
        id: firstId + out.length,
        team,
        unit,
        stats,
        hp: stats.hp,
        shield: 0,
        energy: 0,
        x: W / 2 + side * depth,
        y: H / 2 + (i - (group.length - 1) / 2) * 1.8,
        cooldown: 0,
        targetId: null,
        alive: true,
      })
    })
  line(melee, 4)
  line(ranged, 8)
  return out
}

export function simulateCombat(teamA: readonly Unit[], teamB: readonly Unit[], seed: number): CombatResult {
  const rng = new Rng(seed)
  const a = deploy(teamA, 0, 0)
  const units = [...a, ...deploy(teamB, 1, a.length)]
  const events: CombatEvent[] = []
  const frames: Float32Array[] = []
  let t = 0

  const dist = (p: CombatUnit, q: CombatUnit) => Math.hypot(p.x - q.x, p.y - q.y)
  const enemiesOf = (u: CombatUnit) => units.filter((o) => o.alive && o.team !== u.team)
  const alliesOf = (u: CombatUnit) => units.filter((o) => o.alive && o.team === u.team)

  const nearest = (u: CombatUnit, pool: CombatUnit[]) => {
    let best: CombatUnit | null = null
    let bestD = Infinity
    for (const o of pool) {
      const d = dist(u, o)
      if (d < bestD) [best, bestD] = [o, d]
    }
    return best
  }

  const cohesive = (u: CombatUnit) => {
    const c = u.stats.cohesion
    if (!c) return false
    return units.some((o) => o !== u && o.alive && o.team === u.team && tagsOf(o.unit).includes(c.tag) && dist(u, o) <= c.radius)
  }

  const attackPower = (u: CombatUnit) => u.stats.atk * (cohesive(u) ? 1 + u.stats.cohesion!.atkBonus : 1)

  const record = () => {
    const f = new Float32Array(units.length * FRAME_STRIDE)
    units.forEach((u, i) => {
      f.set([u.x, u.y, u.hp, u.shield, u.energy], i * FRAME_STRIDE)
    })
    frames.push(f)
  }

  const damage = (src: CombatUnit, tgt: CombatUnit, raw: number, crit = false) => {
    if (!tgt.alive) return 0
    const mitigation = 100 / (100 + tgt.stats.def)
    const reduction = cohesive(tgt) ? tgt.stats.cohesion!.damageReduction : 0
    let amount = raw * mitigation * (1 - reduction) * (crit ? 2 : 1)
    const absorbed = Math.min(tgt.shield, amount)
    tgt.shield -= absorbed
    tgt.hp -= amount - absorbed
    tgt.energy = Math.min(tgt.stats.maxEnergy, tgt.energy + CONFIG.combat.energyPerHit)
    amount = Math.round(amount)
    events.push({ t, kind: 'attack', from: src.id, to: tgt.id, amount, crit })
    if (tgt.hp <= 0) {
      tgt.hp = 0
      tgt.alive = false
      events.push({ t, kind: 'death', id: tgt.id })
    }
    return amount
  }

  const cast = (u: CombatUnit, target: CombatUnit) => {
    const ability = CLASS_DEFS[u.unit.cls].ability
    const power = attackPower(u) * u.stats.spellPower
    const hit: number[] = []
    switch (ability) {
      case 'bulwark':
        u.shield += u.stats.hp * 0.3 * u.stats.spellPower
        hit.push(u.id)
        break
      case 'charge':
        damage(u, target, power * 2.2)
        hit.push(target.id)
        break
      case 'blast':
        for (const e of enemiesOf(u)) {
          if (dist(e, target) <= 2) {
            damage(u, e, power * 1.8)
            hit.push(e.id)
          }
        }
        break
      case 'volley':
        for (const e of enemiesOf(u).sort((p, q) => dist(u, p) - dist(u, q)).slice(0, 3)) {
          damage(u, e, power * 1.3)
          hit.push(e.id)
        }
        break
      case 'mend': {
        const ally = alliesOf(u).sort((p, q) => p.hp / p.stats.hp - q.hp / q.stats.hp)[0]
        if (ally) {
          const amount = Math.min(ally.stats.hp - ally.hp, (ally.stats.hp * 0.18 + attackPower(u) * 1.5) * u.stats.spellPower)
          ally.hp += amount
          hit.push(ally.id)
          events.push({ t, kind: 'heal', from: u.id, to: ally.id, amount: Math.round(amount) })
        }
        break
      }
      case 'backstab': {
        const prey = enemiesOf(u).sort((p, q) => p.hp - q.hp)[0]
        if (prey) {
          u.x = clampX(prey.x + (prey.team === 1 ? 0.8 : -0.8))
          u.y = prey.y
          u.targetId = prey.id
          damage(u, prey, power * 2.5, rng.chance(u.stats.critChance))
          hit.push(prey.id)
        }
        break
      }
    }
    events.push({ t, kind: 'ability', from: u.id, ability, targets: hit })
  }

  const act = (u: CombatUnit) => {
    u.cooldown -= DT
    let target = u.targetId === null ? null : units[u.targetId]!
    if (!target?.alive) {
      target = nearest(u, enemiesOf(u))
      u.targetId = target?.id ?? null
    }
    if (!target) return

    const d = dist(u, target)
    if (d > u.stats.range) {
      const step = Math.min(u.stats.moveSpeed * DT, d - u.stats.range + 0.01)
      u.x += ((target.x - u.x) / d) * step
      u.y += ((target.y - u.y) / d) * step
    } else if (u.cooldown <= 0) {
      damage(u, target, attackPower(u), rng.chance(u.stats.critChance))
      u.energy = Math.min(u.stats.maxEnergy, u.energy + CONFIG.combat.energyPerAttack)
      u.cooldown = 1 / u.stats.atkSpeed
    }

    if (u.energy >= u.stats.maxEnergy && target.alive) {
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
      u.x = clampX(u.x)
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
    const health = (team: Team) =>
      units.filter((u) => u.team === team).reduce((sum, u) => sum + u.hp / u.stats.hp, 0)
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
      cls: u.unit.cls,
      element: u.unit.element,
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

function clampX(x: number) {
  return Math.min(W - 0.5, Math.max(0.5, x))
}
