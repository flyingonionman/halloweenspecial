import { describe, expect, it } from 'vitest'
import {
  CONFIG,
  Rng,
  build,
  buyUnit,
  civTier,
  computeSynergies,
  createUnit,
  endEra,
  finishBattle,
  generateOpponent,
  generateShop,
  newCiv,
  newGame,
  rarityOdds,
  simulateCombat,
  unitPower,
  unitStats,
  upgradeCost,
  upgradeUnit,
  type GameState,
  type Unit,
  type UnitRoll,
} from './index'

const counter = () => {
  let n = 0
  return () => `t${n++}`
}

const mk = (roll: Partial<UnitRoll> = {}, level = 1): Unit => ({
  ...createUnit('x', { cls: 'knight', element: 'earth', rarity: 'common', quality: 1, ...roll }, new Rng(1)),
  level,
})

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })
})

describe('units', () => {
  it('rarity and level both raise stats', () => {
    expect(unitStats(mk({ rarity: 'rare' })).hp).toBeGreaterThan(unitStats(mk()).hp)
    expect(unitStats(mk({}, 3)).atk).toBeGreaterThan(unitStats(mk()).atk)
  })

  it('veterans upgrade cheaper', () => {
    const fresh = mk({ rarity: 'epic' })
    const vet = { ...fresh, battlesSurvived: 3 }
    expect(upgradeCost(vet)!).toBeLessThan(upgradeCost(fresh)!)
  })

  it('max level cannot upgrade', () => {
    expect(upgradeCost(mk({}, CONFIG.level.max))).toBeNull()
  })
})

describe('civ tiers', () => {
  it('maps population thresholds to rarities', () => {
    expect(civTier(50)).toBe('common')
    expect(civTier(100)).toBe('uncommon')
    expect(civTier(1_000)).toBe('rare')
    expect(civTier(100_000)).toBe('epic')
    expect(civTier(1_000_000)).toBe('legendary')
  })

  it('locked rarities have zero odds and odds sum to 1', () => {
    const odds = rarityOdds(500)
    expect(odds.rare).toBe(0)
    expect(odds.uncommon).toBeGreaterThan(0)
    expect(Object.values(odds).reduce((a, b) => a + b)).toBeCloseTo(1)
  })
})

describe('shop', () => {
  it('offers shopSize distinct units', () => {
    const offers = generateShop(newCiv(), new Rng(7), counter())
    expect(offers).toHaveLength(CONFIG.shopSize)
    expect(new Set(offers.map((o) => o.unit.uid)).size).toBe(CONFIG.shopSize)
  })

  it('never offers rarities above the civ tier', () => {
    const offers = generateShop({ ...newCiv(), population: 900 }, new Rng(7), counter())
    expect(offers.every((o) => o.unit.rarity === 'common' || o.unit.rarity === 'uncommon')).toBe(true)
  })

  it('buildings skew the shop toward their tag', () => {
    const share = (civ = newCiv()) =>
      generateShop(civ, new Rng(3), counter(), 2000).filter((o) => o.unit.cls === 'mage').length / 2000
    const invested = { ...newCiv(), buildings: { 'mage-hall': 5 } }
    expect(share(invested)).toBeGreaterThan(share() * 2)
  })
})

describe('synergies', () => {
  it('activates at thresholds', () => {
    const troop = [mk({ cls: 'mage', element: 'fire' }), mk({ cls: 'mage', element: 'fire' })]
    const syn = computeSynergies(troop)
    expect(syn.find((s) => s.def.tag === 'mage')!.tier).toBe(0)
    expect(syn.find((s) => s.def.tag === 'fire')!.tier).toBe(0)
    expect(computeSynergies(troop.slice(0, 1)).find((s) => s.def.tag === 'mage')!.tier).toBe(-1)
  })
})

describe('combat', () => {
  const troopA = [mk({ cls: 'knight' }), mk({ cls: 'archer' }), mk({ cls: 'mage' })].map((u, i) => ({ ...u, uid: `a${i}` }))
  const troopB = [mk({ cls: 'rider' }), mk({ cls: 'rogue' }), mk({ cls: 'cleric' })].map((u, i) => ({ ...u, uid: `b${i}` }))

  it('is deterministic for a seed', () => {
    const r1 = simulateCombat(troopA, troopB, 99)
    const r2 = simulateCombat(troopA, troopB, 99)
    expect(r1.winner).toBe(r2.winner)
    expect(r1.events).toEqual(r2.events)
    expect(r1.frames.length).toBe(r2.frames.length)
  })

  it('a much stronger troop wins', () => {
    const strong = troopA.map((u) => ({ ...u, rarity: 'epic' as const, level: 3 }))
    expect(simulateCombat(strong, troopB, 1).winner).toBe(0)
    expect(simulateCombat(troopB, strong, 1).winner).toBe(1)
  })

  it('records a frame per tick and ends before the time limit when one side is wiped', () => {
    const r = simulateCombat(troopA, troopB, 5)
    expect(r.frames.length).toBe(Math.round(r.duration / r.tick) + 1)
    expect(r.duration).toBeLessThan(CONFIG.combat.maxSeconds)
  })
})

describe('ai', () => {
  it('fields a full troop with a front line', () => {
    for (let round = 0; round < CONFIG.rounds; round++) {
      const opp = generateOpponent(round, new Rng(round + 10), counter())
      expect(opp.troop).toHaveLength(CONFIG.troopSize)
      expect(opp.troop.filter((u) => ['knight', 'rider', 'rogue'].includes(u.cls)).length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('game flow', () => {
  /** A greedy bot: build the market once, buy the strongest affordable units, upgrade with leftovers. */
  const playEra = (s: GameState): GameState => {
    s = build(s, 'market')
    const byPower = [...s.shop].sort((a, b) => unitPower(b.unit) - unitPower(a.unit))
    for (const o of byPower) if (s.troop.length < CONFIG.troopSize) s = buyUnit(s, o.unit.uid)
    for (const u of s.troop) s = upgradeUnit(s, u.uid)
    return endEra(s)
  }

  it('is reproducible from a seed', () => {
    expect(newGame(123).shop).toEqual(newGame(123).shop)
  })

  it('runs a whole game to completion', () => {
    let s = newGame(2026)
    let guard = 0
    while (s.phase !== 'over' && guard++ < 100) {
      s = s.phase === 'battle' ? finishBattle(s) : playEra(s)
    }
    expect(s.phase).toBe('over')
    expect(s.history.length).toBeGreaterThan(0)
    expect(s.history.length).toBeLessThanOrEqual(CONFIG.rounds)
    if (s.victory) expect(s.history).toHaveLength(CONFIG.rounds)
    else expect(s.hp).toBe(0)
  })

  it('fallen units are gone and survivors become veterans', () => {
    let s = newGame(7)
    while (s.phase === 'era') s = playEra(s)
    const { outcome } = s.battle!
    const after = finishBattle(s)
    for (const f of outcome.fallen) expect(after.troop.some((u) => u.uid === f.uid)).toBe(false)
    expect(after.troop.every((u) => u.battlesSurvived === 1)).toBe(true)
  })
})
