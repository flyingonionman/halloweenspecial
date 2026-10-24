/**
 * Global game state + every action the UI can take. Actions are pure:
 * (state, ...args) => new state. Invalid actions return the state unchanged;
 * the matching `can*` helpers let the UI disable buttons.
 *
 * Flow: 5 rounds × (3 eras of management → 1 battle).
 */
import { CONFIG } from './config'
import { Rng } from './rng'
import { generateOpponent, type Opponent } from './ai'
import { simulateCombat, type CombatResult } from './combat/sim'
import { BUILDING_BY_ID, buildingCost, growthMultiplier, income, newCiv, type BuildingId, type Civ } from './civ'
import { generateShop, type Offer } from './shop'
import { releaseRefund, upgradeCost, type Unit } from './units/unit'

export type Phase = 'era' | 'battle' | 'over'

export interface BattleOutcome {
  won: boolean
  draw: boolean
  damage: number
  fallen: Unit[]
  enemySurvivors: number
}

export interface Battle {
  opponent: Opponent
  result: CombatResult
  outcome: BattleOutcome
}

export interface GameState {
  seed: number
  rngState: number
  nextUid: number
  phase: Phase
  /** 0-based. */
  round: number
  /** 0-based within the round. */
  era: number
  hp: number
  civ: Civ
  shop: Offer[]
  troop: Unit[]
  bench: Unit[]
  battle: Battle | null
  /** Set when phase is 'over'. */
  victory: boolean
  history: { round: number; won: boolean; damage: number; opponent: string }[]
}

/** Run `fn` against a deep copy with a live Rng and uid counter, then write both back. */
function produce(state: GameState, fn: (s: GameState, rng: Rng, makeUid: () => string) => void): GameState {
  const s = structuredClone(state)
  const rng = new Rng(s.rngState)
  const makeUid = () => `u${s.nextUid++}`
  fn(s, rng, makeUid)
  s.rngState = rng.state
  return s
}

export function newGame(seed: number = Date.now() >>> 0): GameState {
  const base: GameState = {
    seed,
    rngState: seed,
    nextUid: 1,
    phase: 'era',
    round: 0,
    era: 0,
    hp: CONFIG.start.hp,
    civ: newCiv(),
    shop: [],
    troop: [],
    bench: [],
    battle: null,
    victory: false,
    history: [],
  }
  return produce(base, (s, rng, makeUid) => {
    s.shop = generateShop(s.civ, rng, makeUid)
  })
}

const findOwned = (s: GameState, uid: string) => s.troop.find((u) => u.uid === uid) ?? s.bench.find((u) => u.uid === uid)

// ── Shop ──────────────────────────────────────────────────────────────

export function canBuy(s: GameState, uid: string): boolean {
  const offer = s.shop.find((o) => o.unit.uid === uid)
  return (
    s.phase === 'era' &&
    !!offer &&
    s.civ.money >= offer.price &&
    (s.troop.length < CONFIG.troopSize || s.bench.length < CONFIG.benchSize)
  )
}

/** Bought units go into the troop if there's room, otherwise the bench. */
export function buyUnit(state: GameState, uid: string): GameState {
  if (!canBuy(state, uid)) return state
  return produce(state, (s) => {
    const i = s.shop.findIndex((o) => o.unit.uid === uid)
    const [offer] = s.shop.splice(i, 1)
    s.civ.money -= offer!.price
    if (s.troop.length < CONFIG.troopSize) s.troop.push(offer!.unit)
    else s.bench.push(offer!.unit)
  })
}

// ── Troop & bench ─────────────────────────────────────────────────────

export function moveToBench(state: GameState, uid: string): GameState {
  if (state.phase !== 'era' || state.bench.length >= CONFIG.benchSize) return state
  if (!state.troop.some((u) => u.uid === uid)) return state
  return produce(state, (s) => {
    const i = s.troop.findIndex((u) => u.uid === uid)
    s.bench.push(...s.troop.splice(i, 1))
  })
}

/** Moves a benched unit into the troop. If the troop is full, swaps with `swapWith` (or the last troop slot). */
export function moveToTroop(state: GameState, uid: string, swapWith?: string): GameState {
  if (state.phase !== 'era' || !state.bench.some((u) => u.uid === uid)) return state
  return produce(state, (s) => {
    const bi = s.bench.findIndex((u) => u.uid === uid)
    const [unit] = s.bench.splice(bi, 1)
    if (s.troop.length < CONFIG.troopSize) {
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
  if (!u || s.phase !== 'era') return false
  const cost = upgradeCost(u)
  return cost !== null && s.civ.money >= cost
}

export function upgradeUnit(state: GameState, uid: string): GameState {
  if (!canUpgrade(state, uid)) return state
  return produce(state, (s) => {
    const u = findOwned(s, uid)!
    s.civ.money -= upgradeCost(u)!
    u.level++
  })
}

export function releaseUnit(state: GameState, uid: string): GameState {
  if (state.phase !== 'era' || !findOwned(state, uid)) return state
  return produce(state, (s) => {
    const u = findOwned(s, uid)!
    s.civ.money += releaseRefund(u)
    s.troop = s.troop.filter((x) => x.uid !== uid)
    s.bench = s.bench.filter((x) => x.uid !== uid)
  })
}

// ── Civilization ──────────────────────────────────────────────────────

export function canBuild(s: GameState, id: BuildingId): boolean {
  const cost = buildingCost(s.civ, id)
  return s.phase === 'era' && cost !== null && s.civ.money >= cost
}

export function build(state: GameState, id: BuildingId): GameState {
  if (!canBuild(state, id) || !BUILDING_BY_ID[id]) return state
  return produce(state, (s) => {
    s.civ.money -= buildingCost(s.civ, id)!
    s.civ.buildings[id] = (s.civ.buildings[id] ?? 0) + 1
  })
}

// ── Era / round flow ──────────────────────────────────────────────────

function advanceEra(s: GameState, rng: Rng, makeUid: () => string) {
  s.civ.population = Math.round(s.civ.population * growthMultiplier(s.civ))
  s.civ.money += income(s.civ)
  s.shop = generateShop(s.civ, rng, makeUid)
}

export const isLastEra = (s: GameState) => s.era >= CONFIG.erasPerRound - 1

export function canEndEra(s: GameState): boolean {
  return s.phase === 'era' && (!isLastEra(s) || s.troop.length > 0)
}

/** Ends the current era. On the last era of a round this starts the battle instead. */
export function endEra(state: GameState): GameState {
  if (!canEndEra(state)) return state
  return produce(state, (s, rng, makeUid) => {
    if (!isLastEra(s)) {
      s.era++
      advanceEra(s, rng, makeUid)
      return
    }
    const opponent = generateOpponent(s.round, rng, makeUid)
    const result = simulateCombat(s.troop, opponent.troop, rng.fork())
    s.battle = { opponent, result, outcome: resolveOutcome(s, result) }
    s.phase = 'battle'
  })
}

function resolveOutcome(s: GameState, result: CombatResult): BattleOutcome {
  const survivors = new Set(result.survivors[0])
  const enemySurvivors = result.survivors[1].length
  const won = result.winner === 0
  const draw = result.winner === 'draw'
  const { base, perRound, perSurvivor } = CONFIG.damage
  const damage = won ? 0 : Math.round((base + perRound * s.round + perSurvivor * enemySurvivors) * (draw ? 0.5 : 1))
  return { won, draw, damage, enemySurvivors, fallen: s.troop.filter((u) => !survivors.has(u.uid)) }
}

/** Apply the battle's consequences and move to the next round (or end the run). */
export function finishBattle(state: GameState): GameState {
  if (state.phase !== 'battle' || !state.battle) return state
  return produce(state, (s, rng, makeUid) => {
    const { outcome, opponent } = s.battle!
    const fallen = new Set(outcome.fallen.map((u) => u.uid))
    s.troop = s.troop.filter((u) => !fallen.has(u.uid))
    for (const u of s.troop) u.battlesSurvived++
    s.hp = Math.max(0, s.hp - outcome.damage)
    s.history.push({ round: s.round, won: outcome.won, damage: outcome.damage, opponent: opponent.name })
    s.battle = null

    if (s.hp <= 0) {
      s.phase = 'over'
      s.victory = false
      return
    }
    if (s.round >= CONFIG.rounds - 1) {
      s.phase = 'over'
      s.victory = true
      return
    }
    s.round++
    s.era = 0
    s.phase = 'era'
    advanceEra(s, rng, makeUid)
  })
}
