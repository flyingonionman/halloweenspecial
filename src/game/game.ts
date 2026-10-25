/**
 * Global game state + every action the UI can take. Actions are pure:
 * (state, ...args) => new state. Invalid actions return the state unchanged;
 * the matching `can*` helpers let the UI disable buttons.
 *
 * Flow: pick a species → 5 rounds × (10 turns of city-building → 1 battle vs a ghost).
 * Each turn: build, claim, trade, recruit freely; plus one deed (a task or a camp raid).
 */
import { CONFIG } from './config'
import { Rng } from './rng'
import { aiGhosts, campTroop, type GhostSnapshot } from './ai'
import { birthCitizens, birthsPerTurn, type BirthContext, type Citizen } from './citizens'
import { simulateCombat, type CombatResult } from './combat/sim'
import { campLoot, rollTasks, taskTitle, type Task } from './deeds'
import { SPECIES, speciesMods, type SpeciesId } from './species'
import { releaseRefund, upgradeCost, type Unit } from './units/unit'
import { BUILDING_DEFS, canPlaceOn, totalCost, type BuildingId } from './world/buildings'
import { affinityBirthWeights, cityBonuses, evaluateCity, type CityStats } from './world/city'
import { hexKey, type Hex } from './world/hex'
import { frontier, generateMap, ownedTiles, tileAt, type WorldMap } from './world/map'
import { RESOURCE_LABEL, TERRAIN_DEFS, emptyStock, type Cost, type Material, type Stock } from './world/terrain'

export type Phase = 'species' | 'turn' | 'battle' | 'over'

export interface BattleOutcome {
  won: boolean
  draw: boolean
  /** Vitality lost (round battles only). */
  damage: number
  fallen: Unit[]
  /** Elves: fallen units come back. */
  fallenReturn: boolean
  enemySurvivors: number
  gold: number
  loot: Cost
  /** Skirmish: the camp tile claimed on victory. */
  claimed: Hex | null
}

export interface Battle {
  kind: 'round' | 'skirmish'
  name: string
  enemy: Unit[]
  result: CombatResult
  outcome: BattleOutcome
}

export interface LogEntry {
  round: number
  turn: number
  text: string
}

export interface GameState {
  seed: number
  rngState: number
  nextUid: number
  phase: Phase
  /** 0-based. */
  round: number
  /** 0-based within the round. */
  turn: number
  hp: number
  maxHp: number
  species: SpeciesId | null
  population: number
  stock: Stock
  map: WorldMap
  muster: Citizen[]
  troop: Unit[]
  bench: Unit[]
  tasks: Task[]
  deedDone: boolean
  /** Extra growth for the current turn (festival). */
  growthBoost: number
  /** This round's opponent, known from turn 1. */
  ghost: GhostSnapshot | null
  battle: Battle | null
  victory: boolean
  history: { round: number; won: boolean; damage: number; opponent: string }[]
  log: LogEntry[]
}

type Ctx = { rng: Rng; makeUid: () => string }

/** Run `fn` against a deep copy with a live Rng and uid counter, then write both back. */
function produce(state: GameState, fn: (s: GameState, ctx: Ctx) => void): GameState {
  const s = structuredClone(state)
  const rng = new Rng(s.rngState)
  fn(s, { rng, makeUid: () => `u${s.nextUid++}` })
  s.rngState = rng.state
  // fn may have read city(s) and then mutated the map; never let that stale entry survive.
  cityCache.delete(s.map)
  return s
}

const log = (s: GameState, text: string) => {
  s.log.push({ round: s.round, turn: s.turn, text })
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40)
}

export const absTurn = (s: Pick<GameState, 'round' | 'turn'>) => s.round * CONFIG.turnsPerRound + s.turn
export const isLastTurn = (s: GameState) => s.turn >= CONFIG.turnsPerRound - 1
export const troopSize = (s: GameState) => CONFIG.troopSize + (speciesMods(s.species).troopSizeDelta ?? 0)
export const unitUpgradeCost = (s: GameState, u: Unit) => upgradeCost(u, speciesMods(s.species).upgradeCostMult ?? 1)

/** Memoized per map object: map is replaced (structuredClone) on every action, so identity is a safe key. */
const cityCache = new WeakMap<WorldMap, CityStats>()
export function city(s: Pick<GameState, 'map'>): CityStats {
  let c = cityCache.get(s.map)
  if (!c) cityCache.set(s.map, (c = evaluateCity(s.map)))
  return c
}

export function birthContext(s: GameState): BirthContext {
  const c = city(s)
  return { population: s.population, species: s.species, affinityWeights: affinityBirthWeights(c), affinityLevels: c.affinityLevels }
}

// ── Setup ─────────────────────────────────────────────────────────────

export function newGame(seed: number = Date.now() >>> 0): GameState {
  const rng = new Rng(seed)
  const map = generateMap(rng)
  return {
    seed,
    rngState: rng.state,
    nextUid: 1,
    phase: 'species',
    round: 0,
    turn: 0,
    hp: CONFIG.start.hp,
    maxHp: CONFIG.start.hp,
    species: null,
    population: CONFIG.start.population,
    stock: emptyStock(),
    map,
    muster: [],
    troop: [],
    bench: [],
    tasks: [],
    deedDone: false,
    growthBoost: 0,
    ghost: null,
    battle: null,
    victory: false,
    history: [],
    log: [],
  }
}

export function chooseSpecies(state: GameState, id: SpeciesId): GameState {
  if (state.phase !== 'species' || !SPECIES[id]) return state
  return produce(state, (s, ctx) => {
    s.species = id
    s.maxHp = s.hp = speciesMods(id).startHp ?? CONFIG.start.hp
    s.stock.gold = CONFIG.start.gold
    const home = TERRAIN_DEFS[s.map.homeBiome].resource
    if (home !== 'food' && home !== 'gold') s.stock[home] += CONFIG.start.homeResource
    s.muster = birthCitizens(birthContext(s), Math.max(6, troopSize(s)), ctx.rng, ctx.makeUid, CONFIG.muster.lifespan - 1)
    s.phase = 'turn'
    startRound(s, ctx)
    log(s, `The ${SPECIES[id].name} settle in ${TERRAIN_DEFS[s.map.homeBiome].label.toLowerCase()} country.`)
  })
}

function startRound(s: GameState, ctx: Ctx) {
  s.turn = 0
  s.ghost = aiGhosts.find(s.round, ctx.rng, ctx.makeUid)
  startTurn(s, ctx)
}

function startTurn(s: GameState, ctx: Ctx) {
  s.deedDone = false
  s.growthBoost = 0
  s.tasks = rollTasks(s.map, s.round, s.turn, ctx.rng)
}

const findOwned = (s: GameState, uid: string) => s.troop.find((u) => u.uid === uid) ?? s.bench.find((u) => u.uid === uid)
const canAfford = (s: GameState, cost: Cost) => (Object.entries(cost) as [keyof Stock, number][]).every(([k, v]) => s.stock[k] >= v)
const pay = (s: GameState, cost: Cost) => {
  for (const [k, v] of Object.entries(cost) as [keyof Stock, number][]) s.stock[k] -= v
}
const gain = (s: GameState, cost: Cost, mult = 1) => {
  for (const [k, v] of Object.entries(cost) as [keyof Stock, number][]) s.stock[k] += Math.floor(v * mult)
}

// ── Territory ─────────────────────────────────────────────────────────

export function territoryCap(s: GameState): number {
  const t = CONFIG.territory
  return Math.max(t.capBase, Math.floor(t.capBase + t.capPerDoubling * Math.log2(s.population / CONFIG.start.population)))
}

export function claimCost(s: GameState): number {
  const t = CONFIG.territory
  return t.claimBase + t.claimPerOwned * Math.max(0, ownedTiles(s.map).length - t.startTiles)
}

export type ClaimBlock = 'not-frontier' | 'camp' | 'cap' | 'gold' | null

export function claimBlock(s: GameState, h: Hex): ClaimBlock {
  if (!frontier(s.map).some((t) => t.q === h.q && t.r === h.r)) return 'not-frontier'
  if (tileAt(s.map, h)!.camp) return 'camp'
  if (ownedTiles(s.map).length >= territoryCap(s)) return 'cap'
  if (s.stock.gold < claimCost(s)) return 'gold'
  return null
}

export function claimTile(state: GameState, h: Hex): GameState {
  if (state.phase !== 'turn' || claimBlock(state, h)) return state
  return produce(state, (s) => {
    s.stock.gold -= claimCost(s)
    const t = tileAt(s.map, h)!
    t.owned = true
    log(s, `Claimed ${TERRAIN_DEFS[t.terrain].label.toLowerCase()}.`)
  })
}

// ── Buildings ─────────────────────────────────────────────────────────

export type BuildBlock = 'not-owned' | 'occupied' | 'terrain' | 'unique' | 'cost' | null

export function buildBlock(s: GameState, h: Hex, id: BuildingId): BuildBlock {
  const t = tileAt(s.map, h)
  const def = BUILDING_DEFS[id]
  if (!t?.owned) return 'not-owned'
  if (t.building) return 'occupied'
  if (!canPlaceOn(def, t.terrain)) return 'terrain'
  if (def.unique && s.map.tiles.some((x) => x.building?.id === id)) return 'unique'
  if (!canAfford(s, def.cost(1))) return 'cost'
  return null
}

export function placeBuilding(state: GameState, h: Hex, id: BuildingId): GameState {
  if (state.phase !== 'turn' || buildBlock(state, h, id)) return state
  return produce(state, (s) => {
    pay(s, BUILDING_DEFS[id].cost(1))
    tileAt(s.map, h)!.building = { id, level: 1 }
    log(s, `Built ${BUILDING_DEFS[id].name}.`)
  })
}

export function canUpgradeBuilding(s: GameState, h: Hex): boolean {
  const b = tileAt(s.map, h)?.building
  if (!b || s.phase !== 'turn') return false
  const def = BUILDING_DEFS[b.id]
  return b.level < def.maxLevel && canAfford(s, def.cost(b.level + 1))
}

export function upgradeBuilding(state: GameState, h: Hex): GameState {
  if (!canUpgradeBuilding(state, h)) return state
  return produce(state, (s) => {
    const b = tileAt(s.map, h)!.building!
    pay(s, BUILDING_DEFS[b.id].cost(b.level + 1))
    b.level++
    log(s, `${BUILDING_DEFS[b.id].name} reached level ${b.level}.`)
  })
}

export function demolishRefund(s: GameState, h: Hex): Cost {
  const b = tileAt(s.map, h)?.building
  if (!b) return {}
  const out: Cost = {}
  for (const [k, v] of Object.entries(totalCost(BUILDING_DEFS[b.id], b.level)) as [keyof Stock, number][]) {
    out[k] = Math.floor(v * CONFIG.demolishRefund)
  }
  return out
}

export function demolish(state: GameState, h: Hex): GameState {
  const b = tileAt(state.map, h)?.building
  if (state.phase !== 'turn' || !b || b.id === 'capital') return state
  return produce(state, (s) => {
    gain(s, demolishRefund(s, h))
    tileAt(s.map, h)!.building = null
    log(s, `Demolished ${BUILDING_DEFS[b.id].name}.`)
  })
}

// ── Trade ─────────────────────────────────────────────────────────────

export function canTrade(s: GameState, give: Material, get: Material): boolean {
  const rate = city(s).tradeRate
  return s.phase === 'turn' && rate !== null && give !== get && s.stock[give] >= rate
}

export function trade(state: GameState, give: Material, get: Material): GameState {
  if (!canTrade(state, give, get)) return state
  return produce(state, (s) => {
    s.stock[give] -= city(state).tradeRate!
    s.stock[get] += 1
  })
}

// ── Muster, troop & bench ─────────────────────────────────────────────

export function canRecruit(s: GameState, uid: string): boolean {
  const c = s.muster.find((m) => m.unit.uid === uid)
  return (
    s.phase === 'turn' &&
    !!c &&
    s.stock.gold >= c.price &&
    (s.troop.length < troopSize(s) || s.bench.length < CONFIG.benchSize)
  )
}

/** Recruits go into the troop if there's room, otherwise the bench. */
export function recruit(state: GameState, uid: string): GameState {
  if (!canRecruit(state, uid)) return state
  return produce(state, (s) => {
    const i = s.muster.findIndex((m) => m.unit.uid === uid)
    const [c] = s.muster.splice(i, 1)
    s.stock.gold -= c!.price
    if (s.troop.length < troopSize(s)) s.troop.push(c!.unit)
    else s.bench.push(c!.unit)
  })
}

const managing = (s: GameState) => s.phase === 'turn'

export function moveToBench(state: GameState, uid: string): GameState {
  if (!managing(state) || state.bench.length >= CONFIG.benchSize) return state
  if (!state.troop.some((u) => u.uid === uid)) return state
  return produce(state, (s) => {
    const i = s.troop.findIndex((u) => u.uid === uid)
    s.bench.push(...s.troop.splice(i, 1))
  })
}

/** Moves a benched unit into the troop. If the troop is full, swaps with `swapWith` (or the last troop slot). */
export function moveToTroop(state: GameState, uid: string, swapWith?: string): GameState {
  if (!managing(state) || !state.bench.some((u) => u.uid === uid)) return state
  return produce(state, (s) => {
    const bi = s.bench.findIndex((u) => u.uid === uid)
    const [unit] = s.bench.splice(bi, 1)
    if (s.troop.length < troopSize(s)) {
      s.troop.push(unit!)
      return
    }
    let ti = swapWith ? s.troop.findIndex((u) => u.uid === swapWith) : -1
    if (ti < 0) ti = s.troop.length - 1
    const [out] = s.troop.splice(ti, 1, unit!)
    s.bench.splice(bi, 0, out!)
  })
}

export function canUpgrade(s: GameState, uid: string): boolean {
  const u = findOwned(s, uid)
  if (!u || !managing(s)) return false
  const cost = unitUpgradeCost(s, u)
  return cost !== null && s.stock.gold >= cost
}

export function upgradeUnit(state: GameState, uid: string): GameState {
  if (!canUpgrade(state, uid)) return state
  return produce(state, (s) => {
    const u = findOwned(s, uid)!
    s.stock.gold -= unitUpgradeCost(s, u)!
    u.level++
  })
}

export function releaseUnit(state: GameState, uid: string): GameState {
  if (!managing(state) || !findOwned(state, uid)) return state
  return produce(state, (s) => {
    const u = findOwned(s, uid)!
    s.stock.gold += releaseRefund(u)
    s.troop = s.troop.filter((x) => x.uid !== uid)
    s.bench = s.bench.filter((x) => x.uid !== uid)
  })
}

// ── Deeds ─────────────────────────────────────────────────────────────

export function canDoTask(s: GameState, id: string): boolean {
  const t = s.tasks.find((x) => x.id === id)
  if (!t || s.phase !== 'turn' || s.deedDone) return false
  if (t.kind === 'drill') return s.troop.some((u) => u.level < CONFIG.level.max)
  return true
}

export function doTask(state: GameState, id: string): GameState {
  if (!canDoTask(state, id)) return state
  return produce(state, (s, ctx) => {
    const t = s.tasks.find((x) => x.id === id)!
    switch (t.kind) {
      case 'forage':
        for (const r of t.resources) s.stock[r] += t.amount
        break
      case 'caravan':
        s.stock.gold += t.gold
        break
      case 'festival':
        s.growthBoost += t.growth
        break
      case 'census':
        s.muster.push(...birthCitizens(birthContext(s), t.citizens, ctx.rng, ctx.makeUid, absTurn(s) + CONFIG.muster.lifespan))
        break
      case 'prospect':
        s.stock[t.resource] += t.amount
        break
      case 'drill': {
        const eligible = s.troop.filter((u) => u.level < CONFIG.level.max)
        ctx.rng.pick(eligible).level++
        break
      }
    }
    s.deedDone = true
    log(s, `${taskTitle(t)}.`)
  })
}

export type RaidBlock = 'no-camp' | 'not-frontier' | 'deed-used' | 'no-troop' | null

export function raidBlock(s: GameState, h: Hex): RaidBlock {
  const t = tileAt(s.map, h)
  if (!t?.camp) return 'no-camp'
  if (!frontier(s.map).some((f) => f.q === h.q && f.r === h.r)) return 'not-frontier'
  if (s.deedDone) return 'deed-used'
  if (s.troop.length === 0) return 'no-troop'
  return null
}

/** Attack a camp on your frontier with your troop. Real combat; units can die. */
export function raidCamp(state: GameState, h: Hex): GameState {
  if (state.phase !== 'turn' || raidBlock(state, h)) return state
  return produce(state, (s, ctx) => {
    const tile = tileAt(s.map, h)!
    const camp = tile.camp!
    const enemy = campTroop(camp, tile.terrain, s.round, ctx.rng, ctx.makeUid)
    const result = simulateCombat({ units: s.troop, bonuses: cityBonuses(city(s)) }, { units: enemy.troop, bonuses: enemy.bonuses }, ctx.rng.fork())
    const loot = campLoot(camp.strength, s.round)
    const won = result.winner === 0
    const res = TERRAIN_DEFS[tile.terrain].resource
    s.battle = {
      kind: 'skirmish',
      name: camp.name,
      enemy: enemy.troop,
      result,
      outcome: {
        ...baseOutcome(s, result),
        damage: 0,
        gold: won ? loot.gold : 0,
        loot: won && res !== 'food' && res !== 'gold' ? { [res]: loot.resource } : {},
        claimed: won ? { q: h.q, r: h.r } : null,
      },
    }
    s.deedDone = true
    s.phase = 'battle'
  })
}

function baseOutcome(s: GameState, result: CombatResult) {
  const survivors = new Set(result.survivors[0])
  return {
    won: result.winner === 0,
    draw: result.winner === 'draw',
    enemySurvivors: result.survivors[1].length,
    fallen: s.troop.filter((u) => !survivors.has(u.uid)),
    fallenReturn: !!speciesMods(s.species).noPermadeath,
  }
}

// ── Turn / round flow ─────────────────────────────────────────────────

/** Always allowed during a turn: marching with an empty troop forfeits the battle rather than softlocking the run. */
export function canEndTurn(s: GameState): boolean {
  return s.phase === 'turn'
}

/** Collect yields, grow, birth citizens, then move to the next turn (or the round battle). */
export function endTurn(state: GameState): GameState {
  if (!canEndTurn(state)) return state
  return produce(state, (s, ctx) => {
    const c = city(s)
    for (const [k, v] of Object.entries(c.yields)) if (k !== 'food') s.stock[k as keyof Stock] += v
    if (speciesMods(s.species).interest) {
      const { per, max } = CONFIG.economy.interest
      s.stock.gold += Math.min(max, Math.floor(s.stock.gold / per))
    }
    s.population = Math.round(s.population * (1 + c.growth + s.growthBoost))

    const now = absTurn(s)
    s.muster = s.muster.filter((m) => m.leavesAfter > now)
    s.muster.push(...birthCitizens(birthContext(s), birthsPerTurn(c.births, s.species), ctx.rng, ctx.makeUid, now + CONFIG.muster.lifespan))

    if (!isLastTurn(s)) {
      s.turn++
      startTurn(s, ctx)
      return
    }

    const ghost = s.ghost!
    const result = simulateCombat({ units: s.troop, bonuses: cityBonuses(c) }, { units: ghost.troop, bonuses: ghost.bonuses }, ctx.rng.fork())
    const base = baseOutcome(s, result)
    const { base: dBase, perRound, perSurvivor } = CONFIG.damage
    const damage = base.won ? 0 : Math.round((dBase + perRound * s.round + perSurvivor * base.enemySurvivors) * (base.draw ? 0.5 : 1))
    const { base: gBase, perRound: gPer } = CONFIG.rewards.battleGold
    s.battle = {
      kind: 'round',
      name: ghost.name,
      enemy: ghost.troop,
      result,
      outcome: { ...base, damage, gold: base.won ? gBase + gPer * s.round : 0, loot: {}, claimed: null },
    }
    s.phase = 'battle'
  })
}

/** Apply a battle's consequences and return to the city (or end the run). */
export function finishBattle(state: GameState): GameState {
  if (state.phase !== 'battle' || !state.battle) return state
  return produce(state, (s, ctx) => {
    const { kind, outcome, name } = s.battle!
    const fallen = new Set(outcome.fallen.map((u) => u.uid))
    for (const u of s.troop) if (!fallen.has(u.uid)) u.battlesSurvived++
    if (!outcome.fallenReturn) s.troop = s.troop.filter((u) => !fallen.has(u.uid))
    s.stock.gold += outcome.gold
    gain(s, outcome.loot)
    s.battle = null

    if (kind === 'skirmish') {
      if (outcome.claimed) {
        const t = tileAt(s.map, outcome.claimed)!
        t.camp = null
        t.owned = true
      }
      const lootText = (Object.entries(outcome.loot) as [Material, number][]).map(([k, v]) => `+${v} ${RESOURCE_LABEL[k]}`)
      log(s, outcome.won ? `Razed ${name}: +${outcome.gold} gold${lootText.length ? ', ' + lootText.join(', ') : ''}.` : `Repelled at ${name}.`)
      s.phase = 'turn'
      return
    }

    s.hp = Math.max(0, s.hp - outcome.damage)
    s.history.push({ round: s.round, won: outcome.won, damage: outcome.damage, opponent: name })
    if (s.hp <= 0 || s.round >= CONFIG.rounds - 1) {
      s.phase = 'over'
      s.victory = s.hp > 0
      return
    }
    s.round++
    s.phase = 'turn'
    startRound(s, ctx)
  })
}

// ── Score ─────────────────────────────────────────────────────────────

export function development(s: GameState): number {
  const g = CONFIG.glory
  const levels = s.map.tiles.reduce((n, t) => n + (t.building && t.building.id !== 'capital' ? t.building.level : 0), 0)
  return Math.round(g.perLog10Pop * Math.log10(s.population) + g.perTile * ownedTiles(s.map).length + g.perBuildingLevel * levels)
}

/** Development × 2^wins, doubled for winning every round. Greed only pays if you keep winning. */
export function glory(s: GameState): number {
  const wins = s.history.filter((h) => h.won).length
  const flawless = s.phase === 'over' && s.history.length === CONFIG.rounds && wins === CONFIG.rounds
  return Math.round(development(s) * Math.pow(2, wins) * (flawless ? CONFIG.glory.victoryMult : 1))
}

export const keyOf = hexKey
