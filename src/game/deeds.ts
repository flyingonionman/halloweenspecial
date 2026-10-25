/**
 * Deeds: one per turn. Either a safe task from the day's offers, or attacking
 * a camp on your frontier (real combat, real permadeath, real loot).
 */
import { CONFIG } from './config'
import type { Rng } from './rng'
import { MATERIALS, RESOURCE_LABEL, TERRAIN_DEFS, type Material } from './world/terrain'
import { ownedTiles, type WorldMap } from './world/map'

export type Task =
  | { id: string; kind: 'forage'; resources: Material[]; amount: number }
  | { id: string; kind: 'caravan'; gold: number }
  | { id: string; kind: 'festival'; morale: number }
  | { id: string; kind: 'census'; citizens: number }
  | { id: string; kind: 'prospect'; resource: Material; amount: number }
  | { id: string; kind: 'drill' }

export function taskTitle(t: Task): string {
  switch (t.kind) {
    case 'forage':
      return 'Forage the land'
    case 'caravan':
      return 'Send a caravan'
    case 'festival':
      return 'Hold a festival'
    case 'census':
      return 'Call a census'
    case 'prospect':
      return 'Prospect abroad'
    case 'drill':
      return 'Drill the troop'
  }
}

export function taskText(t: Task): string {
  switch (t.kind) {
    case 'forage':
      return `+${t.amount} ${t.resources.map((r) => RESOURCE_LABEL[r]).join(' and +' + t.amount + ' ')}`
    case 'caravan':
      return `+${t.gold} gold`
    case 'festival':
      return `+${t.morale} morale`
    case 'census':
      return `${t.citizens} extra citizens join the muster now`
    case 'prospect':
      return `+${t.amount} ${RESOURCE_LABEL[t.resource]}, from land you don't hold`
    case 'drill':
      return 'A random troop unit gains a level'
  }
}

/** Three distinct offers for this turn. */
export function rollTasks(map: WorldMap, round: number, turn: number, rng: Rng): Task[] {
  const local = [...new Set(ownedTiles(map).map((t) => TERRAIN_DEFS[t.terrain].resource))].filter((r): r is Material =>
    (MATERIALS as readonly string[]).includes(r),
  )
  const foreign = MATERIALS.filter((m) => !local.includes(m))
  const id = (k: string) => `${round}-${turn}-${k}`

  const pool: Task[] = [
    { id: id('caravan'), kind: 'caravan', gold: 4 + 2 * round + Math.floor(turn / 3) },
    { id: id('festival'), kind: 'festival', morale: CONFIG.morale.festival },
    { id: id('census'), kind: 'census', citizens: 2 },
    { id: id('drill'), kind: 'drill' },
  ]
  if (local.length) {
    const picks = [rng.pick(local)]
    const second = local.filter((r) => r !== picks[0])
    if (second.length) picks.push(rng.pick(second))
    pool.push({ id: id('forage'), kind: 'forage', resources: picks, amount: 2 + Math.floor(round / 2) })
  }
  if (foreign.length) pool.push({ id: id('prospect'), kind: 'prospect', resource: rng.pick(foreign), amount: 3 })

  const out: Task[] = []
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!)
  return out
}

export function campLoot(strength: number, round: number) {
  const c = CONFIG.rewards.camp
  return { gold: c.base + c.perStrength * strength + c.perRound * round, resource: c.resPerStrength * strength }
}
