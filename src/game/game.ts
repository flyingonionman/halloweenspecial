/**
 * Global game state + every action the UI can take. Actions are pure:
 * (state, ...args) => new state. Invalid actions return the state unchanged;
 * the matching `can*` helpers let the UI disable buttons.
 *
 * Flow: pick a species → 5 rounds × (10 turns of city-building → 1 battle vs a ghost).
 * Each turn: build, claim, grow academies, trade, raid camps, and recruit: call a muster (morale), then enlist from it.
 * Round battles are sudden elimination: lose one and the run is over.
 *
 * Morale is both currency (calling musters, enlisting citizens) and productivity
 * (it scales every field's output), so recruiting hard weakens the economy.
 */
import { CONFIG } from './config'
import { Rng } from './rng'
import { aiGhosts, campTroop, type GhostSnapshot } from './ai'
import { birthCitizens, musterSize, type BirthContext, type Citizen } from './citizens'
import { simulateCombat, type CombatResult } from './combat/sim'
import { campLoot } from './deeds'
import { SPECIES, speciesMods, type SpeciesId } from './species'
import { releaseRefund, upgradeCost, type Unit } from './units/unit'
import { AFFINITY_LABEL, academyFlow, affinitiesOfTier, childrenOf, researchCost, type Affinity } from './affinities'
import { BUILDING_DEFS, buildingName, canPlaceOn, totalCost, type BuildingId } from './world/buildings'
import { cityBonuses, evaluateCity, isUnlocked, type CityStats } from './world/city'
import { troopEconomy } from './synergy'
import { hexKey, type Hex } from './world/hex'
import { frontier, generateMap, ownedTiles, tileAt, type PlacedBuilding, type WorldMap } from './world/map'
import { RESOURCE_LABEL, TERRAIN_DEFS, emptyStock, type Cost, type Material, type Stock } from './world/terrain'

export type Phase = 'species' | 'turn' | 'battle' | 'over'

export interface BattleOutcome {
  won: boolean
  draw: boolean
  fallen: Unit[]
  /** Elves: fallen units come back. */
  fallenReturn: boolean
  enemySurvivors: number
  gold: number
  loot: Cost
  /** Change to morale when the battle is resolved. */
  morale: number
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
  species: SpeciesId | null
  population: number
  stock: Stock
  /** 0–CONFIG.morale.max. */
  morale: number
  map: WorldMap
  muster: Citizen[]
  troop: Unit[]
  bench: Unit[]
  /** Musters called this turn (each costs more). */
  musterCalls: number
  /** This round's opponent, known from turn 1. */
  ghost: GhostSnapshot | null
  battle: Battle | null
  victory: boolean
  history: { round: number; won: boolean; opponent: string }[]
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

// ── Morale & the economy ──────────────────────────────────────────────

const clampMorale = (v: number) => Math.max(0, Math.min(CONFIG.morale.max, v))

/** Field output multiplier from morale: outputAtZero at 0, outputAtMax at full. */
export function moraleMult(morale: number): number {
  const m = CONFIG.morale
  return m.outputAtZero + (m.outputAtMax - m.outputAtZero) * (morale / m.max)
}

type EconView = Pick<GameState, 'map' | 'morale' | 'troop'>

/** What your fields actually produce this turn: city yields × morale × tier-1 troop synergies. */
export function effectiveYields(s: EconView): Record<keyof CityStats['yields'], number> {
  const mult = moraleMult(s.morale)
  const c = city(s)
  const eco = troopEconomy(s.troop, c.affinityLevels)
  return Object.fromEntries(
    Object.entries(c.yields).map(([k, v]) => [k, Math.round(v * mult * (1 + (eco.yieldPct[k as keyof typeof eco.yieldPct] ?? 0)))]),
  ) as Record<keyof CityStats['yields'], number>
}

/** Morale regained each turn: base regen plus Light-style troop synergies. */
export function moraleRegen(s: EconView): number {
  return CONFIG.morale.regen + troopEconomy(s.troop, city(s).affinityLevels).morale
}

/** Fractional population growth this turn, driven by (morale-adjusted) food. */
export function growthRate(s: EconView): number {
  const { growthBase, growthPerFood, maxGrowth } = CONFIG.economy
  return Math.min(maxGrowth, growthBase + growthPerFood * effectiveYields(s).food)
}

export function birthContext(s: GameState): BirthContext {
  return { population: s.population, species: s.species, academies: city(s).academies }
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
    species: null,
    population: CONFIG.start.population,
    stock: emptyStock(),
    morale: CONFIG.morale.start,
    map,
    muster: [],
    troop: [],
    bench: [],
    musterCalls: 0,
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
    s.stock.gold = CONFIG.start.gold
    s.stock.stone = CONFIG.start.stone
    // No muster yet: the player recruits (calls one) when they want citizens.
    s.phase = 'turn'
    startRound(s, ctx)
    log(s, `The ${SPECIES[id].name} settle in ${TERRAIN_DEFS[s.map.homeBiome].label.toLowerCase()} country.`)
  })
}

function startRound(s: GameState, ctx: Ctx) {
  s.turn = 0
  s.ghost = aiGhosts.find(s.round, ctx.rng, ctx.makeUid)
  startTurn(s)
}

function startTurn(s: GameState) {
  s.musterCalls = 0
}

const findOwned = (s: GameState, uid: string) => s.troop.find((u) => u.uid === uid) ?? s.bench.find((u) => u.uid === uid)
const canAfford = (s: GameState, cost: Cost) => (Object.entries(cost) as [keyof Stock, number][]).every(([k, v]) => s.stock[k] >= v)

/** What you're short of for `cost` (empty when you can afford it). */
export function shortfall(s: Pick<GameState, 'stock'>, cost: Cost): Cost {
  const out: Cost = {}
  for (const [k, v] of Object.entries(cost) as [keyof Stock, number][]) if (s.stock[k] < v) out[k] = v - s.stock[k]
  return out
}
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

/** Earth's secondary role: it pays for land. The same claim costs this much earth instead of gold. */
export const claimEarthCost = (s: GameState) => Math.ceil(claimCost(s) / CONFIG.territory.goldPerEarth)

export type ClaimPay = 'gold' | 'earth'
export type ClaimBlock = 'not-frontier' | 'camp' | 'cap' | 'gold' | 'earth' | null

export function claimBlock(s: GameState, h: Hex, pay: ClaimPay = 'gold'): ClaimBlock {
  if (!frontier(s.map).some((t) => t.q === h.q && t.r === h.r)) return 'not-frontier'
  if (tileAt(s.map, h)!.camp) return 'camp'
  if (ownedTiles(s.map).length >= territoryCap(s)) return 'cap'
  if (pay === 'gold' && s.stock.gold < claimCost(s)) return 'gold'
  if (pay === 'earth' && s.stock.earth < claimEarthCost(s)) return 'earth'
  return null
}

export function claimTile(state: GameState, h: Hex, pay: ClaimPay = 'gold'): GameState {
  if (state.phase !== 'turn' || claimBlock(state, h, pay)) return state
  return produce(state, (s) => {
    if (pay === 'earth') s.stock.earth -= claimEarthCost(s)
    else s.stock.gold -= claimCost(s)
    const t = tileAt(s.map, h)!
    t.owned = true
    log(s, `Claimed ${TERRAIN_DEFS[t.terrain].label.toLowerCase()}${pay === 'earth' ? ' with mud' : ''}.`)
  })
}

// ── Buildings ─────────────────────────────────────────────────────────

export type BuildBlock = 'not-owned' | 'occupied' | 'terrain' | 'unique' | 'cost' | null

/** What building `id` costs you right now. Arcane's main use: every Academy after your first needs it. */
export function buildCost(s: GameState, id: BuildingId): Cost {
  const cost = { ...BUILDING_DEFS[id].cost(1) }
  if (id === 'academy') {
    const owned = city(s).academyCount
    if (owned > 0) cost.arcane = CONFIG.affinity.extraAcademyArcane * owned
  }
  return cost
}

export function buildBlock(s: GameState, h: Hex, id: BuildingId): BuildBlock {
  const t = tileAt(s.map, h)
  const def = BUILDING_DEFS[id]
  if (!t?.owned) return 'not-owned'
  if (t.building) return 'occupied'
  if (!canPlaceOn(def, t.terrain)) return 'terrain'
  if (def.unique && s.map.tiles.some((x) => x.building?.id === id)) return 'unique'
  if (!canAfford(s, buildCost(s, id))) return 'cost'
  return null
}

export function placeBuilding(state: GameState, h: Hex, id: BuildingId): GameState {
  if (state.phase !== 'turn' || buildBlock(state, h, id)) return state
  return produce(state, (s) => {
    pay(s, buildCost(s, id))
    // Academies go up empty (level 0) until an offering dedicates them.
    tileAt(s.map, h)!.building = { id, level: id === 'academy' ? 0 : 1 }
    log(s, `Built a ${buildingName(id)}.`)
  })
}

export function canUpgradeBuilding(s: GameState, h: Hex): boolean {
  const b = tileAt(s.map, h)?.building
  if (!b || s.phase !== 'turn' || b.id === 'academy') return false
  const def = BUILDING_DEFS[b.id]
  return b.level < def.maxLevel && canAfford(s, def.cost(b.level + 1))
}

export function upgradeBuilding(state: GameState, h: Hex): GameState {
  if (!canUpgradeBuilding(state, h)) return state
  return produce(state, (s) => {
    const b = tileAt(s.map, h)!.building!
    pay(s, BUILDING_DEFS[b.id].cost(b.level + 1))
    b.level++
    const renamed = buildingName(b.id, b.level) !== buildingName(b.id, b.level - 1)
    log(s, renamed ? `${buildingName(b.id, b.level - 1)} became a ${buildingName(b.id, b.level)}.` : `${buildingName(b.id)} reached level ${b.level}.`)
  })
}

// ── Academies: dedicate, raise, evolve ────────────────────────────────
//
// Growing an academy costs an upfront payment *and* a standing throughput
// commitment: a fixed amount of essence per turn per level (`academyFlow`),
// taken from every turn's income. The change takes effect next turn. An empty
// academy is dedicated to a tier-1 affinity; higher tiers come from evolving a
// dedicated academy into a child affinity once that child is unlocked.

/** One way to grow an academy. */
export interface AcademyMove {
  kind: 'dedicate' | 'raise' | 'evolve'
  affinity: Affinity
  level: number
}

export type AcademyBlock = 'no-academy' | 'pending' | 'locked' | 'cost' | 'flow' | null

/** What an academy is committed to: its pending change if any, else what it teaches now (null if empty). */
export function academyCommitment(b: PlacedBuilding): { affinity: Affinity; level: number } | null {
  return b.pending ?? (b.affinity && b.level > 0 ? { affinity: b.affinity, level: b.level } : null)
}

const owned = (s: Pick<GameState, 'map'>) => s.map.tiles.filter((t) => t.owned)

/** Essence per turn all your academies draw, together. */
export function academyUpkeep(s: Pick<GameState, 'map'>): Cost {
  const out: Cost = {}
  for (const t of owned(s)) {
    const c = t.building?.id === 'academy' ? academyCommitment(t.building) : null
    if (c) for (const [k, v] of Object.entries(academyFlow(c.affinity, c.level)) as [keyof Stock, number][]) out[k] = (out[k] ?? 0) + v
  }
  return out
}

/** Income per turn after academy upkeep (an essence can go negative: the shortfall comes out of stock). */
export function netYields(s: EconView): Record<keyof CityStats['yields'], number> {
  const y = { ...effectiveYields(s) }
  for (const [k, v] of Object.entries(academyUpkeep(s)) as [keyof typeof y, number][]) y[k] -= v
  return y
}

/** Every move this academy offers right now. */
export function academyMoves(s: GameState, h: Hex): AcademyMove[] {
  const b = tileAt(s.map, h)?.building
  if (b?.id !== 'academy') return []
  const cur = academyCommitment(b)
  if (!cur) return affinitiesOfTier(1).map((a) => ({ kind: 'dedicate', affinity: a, level: 1 }))
  const out: AcademyMove[] = []
  if (cur.level < CONFIG.affinity.maxLevel) out.push({ kind: 'raise', affinity: cur.affinity, level: cur.level + 1 })
  if (cur.level >= CONFIG.affinity.unlockLevel) for (const c of childrenOf(cur.affinity)) out.push({ kind: 'evolve', affinity: c, level: 1 })
  return out
}

/** A move's upfront payment, the academy's new total throughput per turn, and the extra on top of today's. */
export function academyMoveCost(s: GameState, h: Hex, m: AcademyMove): { upfront: Cost; flow: Cost; extra: Cost } {
  const b = tileAt(s.map, h)?.building
  const cur = b ? academyCommitment(b) : null
  const flow = academyFlow(m.affinity, m.level)
  const was = cur ? academyFlow(cur.affinity, cur.level) : {}
  const extra: Cost = {}
  for (const [k, v] of Object.entries(flow) as [keyof Stock, number][]) if (v > (was[k] ?? 0)) extra[k] = v - (was[k] ?? 0)
  return { upfront: researchCost(m.affinity, m.level), flow, extra }
}

/**
 * Why a move can't be made. One change per academy per turn ('pending'); a child
 * needs every parent at the unlock level ('locked'); you must afford the upfront
 * cost ('cost') and have enough uncommitted income for the extra throughput ('flow').
 */
export function academyBlock(s: GameState, h: Hex, m: AcademyMove): AcademyBlock {
  const t = tileAt(s.map, h)
  if (t?.building?.id !== 'academy' || !t.owned) return 'no-academy'
  if (t.building.pending) return 'pending'
  if (m.kind === 'evolve' && !isUnlocked(m.affinity, city(s).affinityLevels)) return 'locked'
  const { upfront, extra } = academyMoveCost(s, h, m)
  if (!canAfford(s, upfront)) return 'cost'
  const net = netYields(s)
  if ((Object.entries(extra) as [keyof typeof net, number][]).some(([k, v]) => net[k] < v)) return 'flow'
  return null
}

/** Throughput you still need for a move (empty when your free income covers it). */
export function flowShortfall(s: GameState, h: Hex, m: AcademyMove): Cost {
  const net = netYields(s)
  const out: Cost = {}
  for (const [k, v] of Object.entries(academyMoveCost(s, h, m).extra) as [keyof Stock, number][]) if (net[k] < v) out[k] = v - Math.max(0, net[k])
  return out
}

/** Pay upfront and commit the throughput; the academy changes at the start of next turn. */
export function commitAcademy(state: GameState, h: Hex, m: AcademyMove): GameState {
  if (state.phase !== 'turn' || academyBlock(state, h, m)) return state
  return produce(state, (s) => {
    pay(s, academyMoveCost(s, h, m).upfront)
    const b = tileAt(s.map, h)!.building!
    b.pending = { affinity: m.affinity, level: m.level }
    const name = AFFINITY_LABEL[m.affinity]
    log(s, m.kind === 'dedicate' ? `An academy was dedicated to ${name}; it opens next turn.` : m.kind === 'evolve' ? `An academy is evolving into ${name}.` : `A ${name} academy is rising to level ${m.level}.`)
  })
}

/** End of turn: every academy draws its throughput from stock (starving if it can't), then pending changes land. */
function runAcademies(s: GameState) {
  for (const t of owned(s)) {
    const b = t.building
    if (b?.id !== 'academy') continue
    const c = academyCommitment(b)
    if (!c) continue
    const upkeep = academyFlow(c.affinity, c.level)
    const starved = !canAfford(s, upkeep)
    if (!starved) pay(s, upkeep)
    if (starved && !b.starved) log(s, `The ${AFFINITY_LABEL[c.affinity]} academy is starved of essence and teaches nothing until its upkeep is paid.`)
    b.starved = starved
    if (b.pending) {
      b.affinity = b.pending.affinity
      b.level = b.pending.level
      delete b.pending
    }
  }
}

// ── Faith (the Church) ────────────────────────────────────────────────

export const ownsBuilding = (s: GameState, id: BuildingId) => s.map.tiles.some((t) => t.owned && t.building?.id === id)

export function canOffer(s: GameState): boolean {
  return s.phase === 'turn' && ownsBuilding(s, 'church') && s.stock.light >= CONFIG.faith.lightPerOffering && s.morale < CONFIG.morale.max
}

/** Light's secondary role: offer it at a Church for morale. */
export function offerLight(state: GameState): GameState {
  if (!canOffer(state)) return state
  return produce(state, (s) => {
    s.stock.light -= CONFIG.faith.lightPerOffering
    s.morale = clampMorale(s.morale + CONFIG.faith.moralePerOffering)
    log(s, `An offering of light: +${CONFIG.faith.moralePerOffering} morale.`)
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
    log(s, `Demolished ${buildingName(b.id, b.level)}.`)
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
    s.morale >= c.price &&
    (s.troop.length < troopSize(s) || s.bench.length < CONFIG.benchSize)
  )
}

/** Recruits go into the troop if there's room, otherwise the bench. */
export function recruit(state: GameState, uid: string): GameState {
  if (!canRecruit(state, uid)) return state
  return produce(state, (s) => {
    const i = s.muster.findIndex((m) => m.unit.uid === uid)
    const [c] = s.muster.splice(i, 1)
    s.morale -= c!.price
    if (s.troop.length < troopSize(s)) s.troop.push(c!.unit)
    else s.bench.push(c!.unit)
  })
}

export const musterCost = (s: GameState) => CONFIG.muster.call.base + CONFIG.muster.call.step * s.musterCalls

export function canCallMuster(s: GameState): boolean {
  return s.phase === 'turn' && s.morale >= musterCost(s)
}

/** Recruit: spend morale to call a muster. Calling again sends whoever is waiting home. */
export function callMuster(state: GameState): GameState {
  if (!canCallMuster(state)) return state
  return produce(state, (s, ctx) => {
    s.morale -= musterCost(s)
    s.musterCalls++
    s.muster = birthCitizens(birthContext(s), musterSize(s.species), ctx.rng, ctx.makeUid)
    log(s, s.musterCalls === 1 ? 'Called a muster.' : 'Called a new muster.')
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

/** Swaps two owned units' places (within or across troop and bench). */
export function swapUnits(state: GameState, a: string, b: string): GameState {
  if (!managing(state) || a === b || !findOwned(state, a) || !findOwned(state, b)) return state
  return produce(state, (s) => {
    const at = (uid: string) => {
      const list = s.troop.some((u) => u.uid === uid) ? s.troop : s.bench
      return [list, list.findIndex((u) => u.uid === uid)] as const
    }
    const [la, ia] = at(a)
    const [lb, ib] = at(b)
    const ua = la[ia]!
    la[ia] = lb[ib]!
    lb[ib] = ua
  })
}

export function canUpgrade(s: GameState, uid: string): boolean {
  const u = findOwned(s, uid)
  if (!u || !managing(s)) return false
  const cost = unitUpgradeCost(s, u)
  return cost !== null && canAfford(s, cost)
}

export function upgradeUnit(state: GameState, uid: string): GameState {
  if (!canUpgrade(state, uid)) return state
  return produce(state, (s) => {
    const u = findOwned(s, uid)!
    pay(s, unitUpgradeCost(s, u)!)
    u.level++
    log(s, `${u.name} reached level ${u.level}.`)
  })
}

/** Give a unit in your troop or bench a new name (1–32 characters). */
export function renameUnit(state: GameState, uid: string, name: string): GameState {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 32)
  const u = findOwned(state, uid)
  if (!clean || !u || u.name === clean) return state
  return produce(state, (s) => {
    findOwned(s, uid)!.name = clean
  })
}

export function releaseUnit(state: GameState, uid: string): GameState {
  if (!managing(state) || !findOwned(state, uid)) return state
  return produce(state, (s) => {
    const u = findOwned(s, uid)!
    s.morale = clampMorale(s.morale + releaseRefund(u))
    s.troop = s.troop.filter((x) => x.uid !== uid)
    s.bench = s.bench.filter((x) => x.uid !== uid)
  })
}

// ── Camps ─────────────────────────────────────────────────────────────

export type RaidBlock = 'no-camp' | 'not-frontier' | 'no-troop' | null

export function raidBlock(s: GameState, h: Hex): RaidBlock {
  const t = tileAt(s.map, h)
  if (!t?.camp) return 'no-camp'
  if (!frontier(s.map).some((f) => f.q === h.q && f.r === h.r)) return 'not-frontier'
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
        gold: won ? loot.gold : 0,
        morale: won ? CONFIG.morale.raidWin : CONFIG.morale.raidLoss,
        loot: won && res !== 'food' && res !== 'gold' ? { [res]: loot.resource } : {},
        claimed: won ? { q: h.q, r: h.r } : null,
      },
    }
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
    for (const [k, v] of Object.entries(effectiveYields(s))) if (k !== 'food') s.stock[k as keyof Stock] += v
    runAcademies(s)
    if (speciesMods(s.species).interest) {
      const { per, max } = CONFIG.economy.interest
      s.stock.gold += Math.min(max, Math.floor(s.stock.gold / per))
    }
    s.population = Math.round(s.population * (1 + growthRate(s)))
    s.morale = clampMorale(s.morale + moraleRegen(s))

    // Whoever didn't answer this muster goes home; next turn starts empty.
    s.muster = []

    if (!isLastTurn(s)) {
      s.turn++
      startTurn(s)
      return
    }

    const ghost = s.ghost!
    const result = simulateCombat({ units: s.troop, bonuses: cityBonuses(c) }, { units: ghost.troop, bonuses: ghost.bonuses }, ctx.rng.fork())
    const base = baseOutcome(s, result)
    const { base: gBase, perRound: gPer } = CONFIG.rewards.battleGold
    s.battle = {
      kind: 'round',
      name: ghost.name,
      enemy: ghost.troop,
      result,
      outcome: { ...base, gold: base.won ? gBase + gPer * s.round : 0, morale: base.won ? CONFIG.morale.battleWin : 0, loot: {}, claimed: null },
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
    s.morale = clampMorale(s.morale + outcome.morale)
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

    s.history.push({ round: s.round, won: outcome.won, opponent: name })
    // Sudden elimination: any round battle you don't win ends the run.
    if (!outcome.won || s.round >= CONFIG.rounds - 1) {
      s.phase = 'over'
      s.victory = outcome.won
      return
    }
    s.round++
    s.phase = 'turn'
    startRound(s, ctx)
  })
}

export const keyOf = hexKey
