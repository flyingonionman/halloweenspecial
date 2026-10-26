import { describe, expect, it } from 'vitest'
import {
  CONFIG,
  affinityOdds,
  rollAffinity,
  buildCost,
  Rng,
  birthCitizens,
  birthRarityOdds,
  buildBlock,
  chooseSpecies,
  city,
  civTier,
  claimBlock,
  claimTile,
  combatStats,
  computeSynergies,
  createUnit,
  demolish,
  endTurn,
  evaluateBuilding,
  finishBattle,
  frontier,
  generateMap,
  hexDistance,
  isRanged,
  newGame,
  ownedTiles,
  placeBuilding,
  raidBlock,
  raidCamp,
  rarityOdds,
  recruit,
  swapUnits,
  musterCost,
  callMuster,
  moraleMult,
  effectiveYields,
  foodDemand,
  foodSurplus,
  popCap,
  civBlock,
  upgradeCiv,
  musterSize,
  birthContext,
  isUnlocked,
  academyBlock,
  academyFlow,
  academyMoves,
  commitAcademy,
  netYields,
  AFFINITY_DEFS,
  routeBlock,
  openRoute,
  closeRoute,
  tradeRoutes,
  claimEarthCost,
  canOffer,
  offerLight,
  buildingName,
  TERRAIN_DEFS,
  troopEconomy,
  simulateCombat,
  arena,
  cellDistance,
  F,
  FRAME_STRIDE,
  formatSpec,
  lineupUnits,
  parseLineup,
  tileAt,
  troopSize,
  unitStats,
  unitUpgradeCost,
  upgradeCost,
  type GameState,
  type SpeciesId,
  type Unit,
  type UnitRoll,
  type WorldMap,
} from './index'
import { playTurn, type BotStyle } from './testing/bot'

const counter = () => {
  let n = 0
  return () => `t${n++}`
}

let uidN = 0
const mk = (roll: Partial<UnitRoll> = {}, level = 1): Unit => ({
  ...createUnit(`m${uidN++}`, { type: 'fighter', affinities: { weaponry: 1 }, rarity: 'common', quality: 1, ...roll }, new Rng(1)),
  level,
})

const started = (seed: number, species: SpeciesId = 'human') => chooseSpecies(newGame(seed), species)

/** A hand-made 3-tile strip for adjacency tests: centre plus two neighbours. */
function strip(centre: WorldMap['tiles'][number]['terrain'], east: WorldMap['tiles'][number]['terrain'], west: WorldMap['tiles'][number]['terrain']): WorldMap {
  const t = (q: number, terrain: typeof centre) => ({ q, r: 0, terrain, owned: true, building: null, camp: null })
  return { radius: 1, homeBiome: 'plains', tiles: [t(0, centre), t(1, east), t(-1, west)] }
}

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

  it('veterans upgrade cheaper; max level cannot upgrade', () => {
    const fresh = mk({ rarity: 'epic' })
    expect(upgradeCost({ ...fresh, battlesSurvived: 3 })!.gold!).toBeLessThan(upgradeCost(fresh)!.gold!)
    // a weaponry unit trains with its roots' essences: fire and earth
    expect(upgradeCost(mk({ rarity: 'epic' }, 3))!.fire).toBeGreaterThan(0)
    expect(upgradeCost(mk({ rarity: 'epic' }, 3))!.earth).toBeGreaterThan(0)
    expect(upgradeCost(mk({ rarity: 'epic' }, 3))!.fire!).toBeGreaterThan(upgradeCost(mk({ rarity: 'epic' }, 1))!.fire!)
    expect(upgradeCost(mk({ rarity: "epic" }, 3))!.gold!).toBeGreaterThan(upgradeCost(fresh)!.gold! * 3)
    expect(upgradeCost(mk({}, CONFIG.level.max))).toBeNull()
  })
})

describe('population', () => {
  it('odds of a rarity keep rising until the next one unlocks', () => {
    expect(rarityOdds(500).uncommon).toBeGreaterThan(rarityOdds(150).uncommon)
    expect(rarityOdds(50_000).rare).toBeGreaterThan(rarityOdds(5_000).rare)
  })

  it('maps thresholds to rarities', () => {
    expect(civTier(50)).toBe('common')
    expect(civTier(100)).toBe('uncommon')
    expect(civTier(1_000)).toBe('rare')
    expect(civTier(100_000)).toBe('epic')
    expect(civTier(1_000_000)).toBe('legendary')
  })

  it('locked rarities have zero odds; odds sum to 1', () => {
    const odds = rarityOdds(500)
    expect(odds.rare).toBe(0)
    expect(Object.values(odds).reduce((a, b) => a + b)).toBeCloseTo(1)
  })
})

describe('map', () => {
  it('is deterministic, owns the capital ring, and keeps camps away from home', () => {
    const a = generateMap(new Rng(5))
    expect(a).toEqual(generateMap(new Rng(5)))
    expect(ownedTiles(a)).toHaveLength(7)
    expect(tileAt(a, { q: 0, r: 0 })!.building?.id).toBe('capital')
    expect(ownedTiles(a).some((t) => t.terrain === a.homeBiome)).toBe(true)
    for (const t of a.tiles.filter((x) => x.camp)) expect(hexDistance(t, { q: 0, r: 0 })).toBeGreaterThanOrEqual(CONFIG.map.campMinDistance)
  })

  it('is one biome: 9 across, about half basic, no lone speciality tiles, one in the starting ring', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = generateMap(new Rng(seed))
      expect(m.tiles).toHaveLength(61)
      expect(TERRAIN_DEFS[m.homeBiome].basic).toBe(true)
      const basic = m.tiles.filter((t) => t.terrain === m.homeBiome).length / m.tiles.length
      expect(basic).toBeGreaterThan(0.4)
      expect(basic).toBeLessThan(0.65)
      const ring = ownedTiles(m).filter((t) => !t.building)
      expect(ring.filter((t) => t.terrain !== m.homeBiome)).toHaveLength(1)
      // every non-basic tile has a neighbour of the same terrain
      for (const t of m.tiles.filter((x) => x.terrain !== m.homeBiome && !x.building)) {
        const same = m.tiles.filter((n) => n.terrain === t.terrain && hexDistance(n, t) === 1)
        expect(same.length, `seed ${seed} ${t.terrain} at ${t.q},${t.r}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('buildings & adjacency', () => {
  it('a mine digs its own tile, gains from matching neighbours, and grows into a quarry', () => {
    const lone = evaluateBuilding(strip('volcanic', 'plains', 'plains'), { q: 0, r: 0 }, 'mine')
    const field = evaluateBuilding(strip('volcanic', 'volcanic', 'volcanic'), { q: 0, r: 0 }, 'mine')
    expect(lone.output.fire).toBe(2)
    expect(field.output.fire).toBe(4)
    expect(evaluateBuilding(strip('hills', 'plains', 'plains'), { q: 0, r: 0 }, 'mine').output.stone).toBe(3)
    expect(evaluateBuilding(strip('volcanic', 'plains', 'plains'), { q: 0, r: 0 }, 'mine', 2).output.fire).toBe(3)
    expect(buildingName('mine', 2)).toBe('Quarry')
    expect(buildingName('mine', 3)).toBe('Excavator')
  })

  it('fisheries are the only building on water', () => {
    const s = started(3)
    const lake = { ...s, map: { ...s.map, tiles: s.map.tiles.map((t) => (t.owned && !t.building ? { ...t, terrain: 'lake' as const } : t)) } }
    const t = ownedTiles(lake.map).find((x) => !x.building)!
    expect(buildBlock(lake, t, 'market')).toBe('terrain')
    expect(buildBlock({ ...lake, stock: { ...lake.stock, water: 0 } }, t, 'fishery')).toBe('cost')
    expect(buildBlock({ ...lake, stock: { ...lake.stock, water: 9 } }, t, 'fishery')).toBeNull()
  })

  it('barracks feed on adjacent mines', () => {
    const m = strip('plains', 'hills', 'plains')
    const before = evaluateBuilding(m, { q: 0, r: 0 }, 'barracks').output.atkPct!
    m.tiles[1]!.building = { id: 'mine', level: 1 }
    expect(evaluateBuilding(m, { q: 0, r: 0 }, 'barracks').output.atkPct!).toBeGreaterThan(before)
  })

  /** Raw income this turn (before routes and academies), for checking deliveries. */
  const effectiveYieldsOf = (s: GameState) => effectiveYields(s)

  /** A started game whose land is fire and earth country (all within 2 of the capital owned), well stocked. */
  const academyGame = () => {
    const s = started(4)
    const map = structuredClone(s.map)
    let i = 0
    for (const t of map.tiles) {
      if (hexDistance(t, { q: 0, r: 0 }) > 2) continue
      t.owned = true
      t.camp = null
      if (!t.building) t.terrain = i++ % 2 ? 'steppe' : 'volcanic'
    }
    return { ...s, map, stock: { ...s.stock, gold: 999, stone: 99, fire: 99, earth: 99, arcane: 99 } }
  }

  it('academies: built empty; every academy after the first costs arcane', () => {
    let s = { ...started(4) }
    s = { ...s, stock: { ...s.stock, gold: 999, stone: 99, arcane: 0 } }
    const [a, b] = ownedTiles(s.map).filter((t) => !t.building)
    expect(buildCost(s, 'academy').arcane).toBeUndefined()
    s = placeBuilding(s, a!, 'academy')
    expect(tileAt(s.map, a!)!.building).toEqual({ id: 'academy', level: 0 })
    expect(city(s).academies).toEqual([])
    expect(buildCost(s, 'academy').arcane).toBe(CONFIG.affinity.extraAcademyArcane)
    expect(buildBlock(s, b!, 'academy')).toBe('cost')
  })

  it('academies grow by an upfront cost plus committed throughput, active from next turn', () => {
    let s = academyGame()
    const [a, b] = ownedTiles(s.map).filter((t) => !t.building)
    s = placeBuilding(placeBuilding(s, a!, 'academy'), b!, 'academy')
    // Empty academies offer tier-1 dedications only.
    expect(academyMoves(s, a!).every((m) => m.kind === 'dedicate' && AFFINITY_DEFS[m.affinity].tier === 1)).toBe(true)

    const fireBefore = netYields(s).fire
    const goldBefore = s.stock.gold
    s = commitAcademy(s, a!, { kind: 'dedicate', affinity: 'fire', level: 1 })
    expect(s.stock.gold).toBeLessThan(goldBefore) // upfront
    expect(netYields(s).fire).toBe(fireBefore - academyFlow('fire', 1).fire!) // throughput committed at once
    expect(city(s).affinityLevels.fire).toBe(0) // …but it only teaches from next turn
    expect(academyBlock(s, a!, { kind: 'raise', affinity: 'fire', level: 2 })).toBe('pending') // one change a turn
    s = endTurn(s)
    expect(city(s).affinityLevels.fire).toBe(1)

    // Raise fire and earth to Lv2 (a turn each), then the fire academy can evolve into Magma.
    s = commitAcademy(s, a!, { kind: 'raise', affinity: 'fire', level: 2 })
    s = commitAcademy(s, b!, { kind: 'dedicate', affinity: 'earth', level: 1 })
    s = endTurn(s)
    s = commitAcademy(s, b!, { kind: 'raise', affinity: 'earth', level: 2 })
    expect(academyBlock(s, a!, { kind: 'evolve', affinity: 'magma', level: 1 })).toBe('locked')
    s = endTurn(s)
    expect(city(s).affinityLevels).toMatchObject({ fire: 2, earth: 2 })
    expect(s.report!.levelsUp).toEqual(expect.arrayContaining([['earth', 2]]))
    expect(s.report!.unlocked).toContain('magma')
    const evolve = academyMoves(s, a!).find((m) => m.kind === 'evolve' && m.affinity === 'magma')!
    expect(academyBlock(s, a!, evolve)).toBeNull()
    s = endTurn(commitAcademy(s, a!, evolve))
    expect(tileAt(s.map, a!)!.building).toMatchObject({ affinity: 'magma', level: 1 })
  })

  it('trade routes commit income now and deliver from next turn', () => {
    let s = academyGame()
    const spot = ownedTiles(s.map).find((t) => !t.building)!
    expect(routeBlock(s, 'earth', 'stone', 1)).toBe('no-post')
    s = placeBuilding(s, spot, 'trading-post')
    const rate = city(s).tradeRate!
    const mud = netYields(s).earth
    expect(routeBlock(s, 'earth', 'stone', 999)).toBe('flow')
    s = openRoute(s, 'earth', 'stone', 1)
    expect(netYields(s).earth).toBe(mud - rate) // set aside at once
    // The turn it opens: nothing moves yet.
    const stone0 = s.stock.stone
    s = endTurn(s)
    expect(s.stock.stone).toBe(stone0 + effectiveYieldsOf(s).stone)
    // From then on: pays rate mud, delivers 1 stone each turn.
    const stone1 = s.stock.stone
    s = endTurn(s)
    expect(s.stock.stone).toBe(stone1 + effectiveYieldsOf(s).stone + 1)
    s = closeRoute(s, 0)
    expect(tradeRoutes(s)).toEqual([])
  })

  it('an academy whose upkeep cannot be paid starves and teaches nothing', () => {
    let s = academyGame()
    const a = ownedTiles(s.map).find((t) => !t.building)!
    s = commitAcademy(placeBuilding(s, a, 'academy'), a, { kind: 'dedicate', affinity: 'fire', level: 1 })
    s = endTurn(s)
    expect(city(s).affinityLevels.fire).toBe(1)
    // Lose every fire field and the stockpile: next turn's upkeep can't be paid.
    const map = structuredClone(s.map)
    for (const t of map.tiles) if (t.terrain === 'volcanic' && !t.building) t.terrain = 'steppe'
    s = endTurn({ ...s, map, stock: { ...s.stock, fire: 0 } })
    expect(tileAt(s.map, a)!.building!.starved).toBe(true)
    expect(city(s).affinityLevels.fire).toBe(0)
  })

  it('placement respects terrain, ownership, uniqueness and cost', () => {
    let s = started(3)
    const plains = ownedTiles(s.map).find((t) => t.terrain === 'plains' && !t.building)
    const dry = ownedTiles(s.map).find((t) => t.terrain !== 'lake' && !t.building)!
    expect(buildBlock(s, dry, 'fishery')).toBe('terrain')
    expect(buildBlock(s, { q: 0, r: 0 }, 'farm')).toBe('occupied')
    if (plains) {
      s = placeBuilding(s, plains, 'farm')
      expect(tileAt(s.map, plains)!.building?.id).toBe('farm')
      const refunded = demolish(s, plains)
      expect(tileAt(refunded.map, plains)!.building).toBeNull()
    }
  })
})

describe('territory', () => {
  it('earth pays for land instead of gold', () => {
    const s = started(11)
    const target = frontier(s.map).find((t) => !t.camp)!
    expect(claimBlock(s, target, 'earth')).toBe('earth')
    const rich = { ...s, stock: { ...s.stock, earth: 10 } }
    const after = claimTile(rich, target, 'earth')
    expect(tileAt(after.map, target)!.owned).toBe(true)
    expect(after.stock.earth).toBe(10 - claimEarthCost(rich))
    expect(after.stock.gold).toBe(rich.stock.gold)
  })

  it('claims frontier tiles for gold, never camps', () => {
    const s = started(11)
    const target = frontier(s.map).find((t) => !t.camp)!
    const after = claimTile(s, target)
    expect(tileAt(after.map, target)!.owned).toBe(true)
    expect(after.stock.gold).toBeLessThan(s.stock.gold)
    const far = s.map.tiles.find((t) => hexDistance(t, { q: 0, r: 0 }) === 4)!
    expect(claimBlock(s, far)).toBe('not-frontier')
  })
})

describe('citizens', () => {
  it('without academies every citizen is born plain', () => {
    const born = birthCitizens({ population: 100_000, species: null, academies: [] }, 200, new Rng(2), counter())
    for (const c of born) expect(c.unit.affinities).toEqual({})
  })

  it('academies give one affinity; their level caps the points', () => {
    const academies = [
      { affinity: 'water' as const, level: 1 },
      { affinity: 'water' as const, level: 1 },
      { affinity: 'water' as const, level: 2 },
    ]
    const born = birthCitizens({ population: 100, species: null, academies }, 2000, new Rng(3), counter())
    const water1 = born.filter((c) => c.unit.affinities.water === 1).length / 2000
    const water2 = born.filter((c) => c.unit.affinities.water === 2).length / 2000
    for (const c of born) expect(Object.keys(c.unit.affinities).length).toBeLessThanOrEqual(1)
    expect(born.some((c) => (c.unit.affinities.water ?? 0) > 2)).toBe(false)
    // very likely water-1, a slim chance of water-2, and some plain citizens
    expect(water1).toBeGreaterThan(0.5)
    expect(water2).toBeGreaterThan(0.02)
    expect(water2).toBeLessThan(0.15)
    const odds = affinityOdds(academies)
    expect(odds.none + odds.affinities.reduce((sum, a) => sum + a.chance, 0)).toBeCloseTo(1)
    expect(odds.affinities[0]!.points[1]!).toBeLessThan(odds.affinities[0]!.points[0]!)
  })

  it('rarity does not change affinity points', () => {
    const academies = [{ affinity: 'fire' as const, level: 1 }]
    const born = birthCitizens({ population: 1_000_000, species: null, academies }, 300, new Rng(5), counter())
    expect(born.some((c) => c.unit.rarity !== 'common')).toBe(true)
    for (const c of born) expect(c.unit.affinities.fire ?? 1).toBe(1)
    expect(rollAffinity([], new Rng(1))).toBeNull()
  })
})

describe('species', () => {
  it('troop sizes, rarity shift, upgrade costs', () => {
    expect(troopSize(started(1, 'goblin'))).toBe(CONFIG.troopSize + 2)
    expect(troopSize(started(1, 'dragon'))).toBe(CONFIG.troopSize - 2)
    expect(birthRarityOdds(100, 'dragon').common).toBe(0)
    const u = mk({ rarity: 'epic' })
    expect(unitUpgradeCost(started(1, "golem"), u)!.gold!).toBeLessThan(unitUpgradeCost(started(1, "human"), u)!.gold!)
  })

  it('orks get a bigger muster; dwarves rarely see ranged', () => {
    expect(callMuster(started(8, 'ork')).muster.length).toBe(musterSize('ork'))
    expect(musterSize('ork')).toBeGreaterThan(musterSize('human'))
    const s = started(9, 'dwarf')
    const born = birthCitizens({ ...birthContext(s), species: 'dwarf' }, 300, new Rng(1), counter())
    expect(born.filter((c) => isRanged(c.unit.type)).length / 300).toBeLessThan(0.12)
  })
})

describe('synergies', () => {
  it('tiers come from points, strength from academy level', () => {
    const troop = [mk({ affinities: { fire: 3 } }), mk({ affinities: { fire: 3 } })]
    const fire = (lvl: number) => computeSynergies(troop, { fire: lvl }).find((s) => s.def.id === 'fire')!
    expect(fire(0).tier).toBe(2)
    expect(fire(4).effects.atkPct!).toBeGreaterThan(fire(0).effects.atkPct!)
  })

  it('effects go to carriers only, unless the affinity is a team synergy', () => {
    const mage = mk({ type: 'mage', affinities: { weaponry: 2 } })
    const troop = [mage, mk({ affinities: { weaponry: 2 } }), mk({ type: 'tank', affinities: { earth: 1 } })]
    const syn = computeSynergies(troop)
    expect(combatStats(mage, syn).atk).toBeGreaterThan(combatStats(mage, []).atk)
    expect(combatStats(mage, syn).damage).toBe('magic')
    expect(combatStats(troop[2]!, syn).atk).toBe(combatStats(troop[2]!, []).atk)
    const thunder = [mk({ affinities: { thunder: 2 } }), mk({ type: 'tank', affinities: { earth: 1 } })]
    expect(combatStats(thunder[1]!, computeSynergies(thunder)).chain).toBeGreaterThan(0)
  })

  it('tier-1 synergies feed the economy', () => {
    const troop = [mk({ affinities: { earth: 3 } }), mk({ affinities: { earth: 3 } })]
    expect(troopEconomy(troop).yieldPct.earth!).toBeGreaterThan(0)
  })
})

describe('combat', () => {
  const troopA = [mk({ type: 'tank' }), mk({ type: 'ranger' }), mk({ type: 'mage' })].map((u, i) => ({ ...u, uid: `a${i}` }))
  const troopB = [mk({ type: 'fighter' }), mk({ type: 'fighter' }), mk({ type: 'healer' })].map((u, i) => ({ ...u, uid: `b${i}` }))

  it('is deterministic and a much stronger troop wins', () => {
    expect(simulateCombat({ units: troopA }, { units: troopB }, 9).events).toEqual(simulateCombat({ units: troopA }, { units: troopB }, 9).events)
    const strong = troopA.map((u) => ({ ...u, rarity: 'epic' as const, level: 3 }))
    expect(simulateCombat({ units: strong }, { units: troopB }, 1).winner).toBe(0)
  })

  const fight = (a: string, b: string, seed = 1) => simulateCombat({ units: lineupUnits(parseLineup(a), 'a') }, { units: lineupUnits(parseLineup(b), 'b') }, seed)

  it('is tick based: one cell per step, one unit per cell, attacks spaced by their tick cost', () => {
    const r = fight('tank,fighter,ranger,mage,healer', 'tank,fighter,fighter,ranger,healer')
    const A = arena(r.arenaRadius)
    for (const e of r.events) if (e.kind === 'move') expect(cellDistance(A, e.from, e.to)).toBe(1)
    for (const f of r.frames) {
      const cells = r.roster.filter((u) => f[u.id * FRAME_STRIDE + F.hp]! > 0).map((u) => f[u.id * FRAME_STRIDE + F.cell]!)
      expect(new Set(cells).size).toBe(cells.length)
    }
    // A unit's consecutive attacks are at least its attack ticks apart (bar double strikes, which this troop lacks).
    for (const u of r.roster) {
      const starts = r.events.filter((e) => e.kind === 'attack' && e.id === u.id).map((e) => e.t)
      for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(u.attackTicks)
    }
  })

  it('tanks grab aggro: damage dealers target an enemy tank first', () => {
    const r = fight('fighter,ranger,mage', 'tank,fighter,ranger')
    const tank = r.roster.find((u) => u.team === 1 && u.type === 'tank')!
    for (const u of r.roster.filter((x) => x.team === 0)) {
      const first = r.events.find((e) => e.kind === 'target' && e.id === u.id)
      expect(first?.kind === 'target' && first.to).toBe(tank.id)
    }
  })

  it('healers heal hurt allies and hex when nobody is hurt', () => {
    const r = fight('tank,healer', 'fighter,fighter')
    const healer = r.roster.find((u) => u.type === 'healer')!
    expect(r.events.some((e) => e.kind === 'heal' && e.from === healer.id && e.to !== healer.id)).toBe(true)
    expect(r.events.some((e) => e.kind === 'attack' && e.id === healer.id && e.hex)).toBe(true)
  })

  it('mirror matches are fair over many seeds', () => {
    let a = 0
    for (let seed = 1; seed <= 60; seed++) if (fight('tank,fighter,ranger,mage,healer', 'tank,fighter,ranger,mage,healer', seed).winner === 0) a++
    expect(a).toBeGreaterThan(15)
    expect(a).toBeLessThan(45)
  })

  it('lineup specs round-trip', () => {
    const specs = parseLineup('tank:rare:3, fighter@fire2, healer')
    expect(specs.map(formatSpec).join(',')).toBe('tank:rare:3,fighter@fire2,healer')
    expect(() => parseLineup('wizard')).toThrow()
  })
})

describe('turns & deeds', () => {
  it('a turn collects yields, grows, and births citizens', () => {
    const s = started(4)
    const next = endTurn(s)
    expect(next.turn).toBe(1)
    expect(next.population).toBeGreaterThan(s.population)
    expect(next.stock.gold).toBeGreaterThan(s.stock.gold)
  })

  it('ending a turn reports what changed', () => {
    const s = started(4)
    const after = endTurn(s)
    const r = after.report!
    expect([r.round, r.turn]).toEqual([s.round, s.turn])
    expect(r.population).toBe(after.population - s.population)
    expect(r.gained.gold ?? 0).toBe(after.stock.gold - s.stock.gold)
  })

  it('an empty troop can still march, and forfeits', () => {
    let s = started(4)
    while (s.phase === 'turn') s = endTurn(s)
    expect(s.phase).toBe('battle')
    expect(s.battle!.outcome.won).toBe(false)
    // sudden elimination
    const after = finishBattle(s)
    expect(after.phase).toBe('over')
    expect(after.victory).toBe(false)
  })

  it('enlisting spends morale, and morale scales field output', () => {
    const s = callMuster(started(4))
    const c = s.muster.find((m) => m.price <= s.morale)!
    const after = recruit(s, c.unit.uid)
    expect(after.morale).toBe(s.morale - c.price)
    expect(moraleMult(CONFIG.morale.max)).toBeGreaterThan(moraleMult(0))
    const rich = effectiveYields({ ...s, morale: CONFIG.morale.max, troop: [] })
    const poor = effectiveYields({ ...s, morale: 0, troop: [] })
    expect(rich.gold).toBeGreaterThan(poor.gold)
  })

  it('swapping units trades their places within and across troop and bench', () => {
    const m = callMuster({ ...started(4), morale: CONFIG.morale.max }).muster.map((c) => c.unit)
    const s: GameState = { ...started(4), troop: [m[0]!, m[1]!], bench: [m[2]!] }
    const ids = (u: { uid: string }[]) => u.map((x) => x.uid)
    const reordered = swapUnits(s, m[0]!.uid, m[1]!.uid)
    expect(ids(reordered.troop)).toEqual([m[1]!.uid, m[0]!.uid])
    const crossed = swapUnits(s, m[2]!.uid, m[0]!.uid)
    expect(ids(crossed.troop)).toEqual([m[2]!.uid, m[1]!.uid])
    expect(ids(crossed.bench)).toEqual([m[0]!.uid])
  })

  it('recruiting (calling a muster) costs morale, more each time; calling again replaces it', () => {
    let s: GameState = { ...started(4), morale: CONFIG.morale.max }
    expect(s.muster).toEqual([])
    const first = musterCost(s)
    s = callMuster(s)
    expect(s.morale).toBe(CONFIG.morale.max - first)
    expect(s.muster).toHaveLength(musterSize(s.species))
    expect(musterCost(s)).toBeGreaterThan(first)
    const again = callMuster(s)
    expect(again.muster.some((c) => s.muster.some((o) => o.unit.uid === c.unit.uid))).toBe(false)
  })

  it('every turn starts with an empty muster at the base price', () => {
    const s = callMuster(started(4))
    const next = endTurn(s)
    expect(next.muster).toEqual([])
    expect(musterCost(next)).toBe(CONFIG.muster.call.base)
  })

  it('higher tiers unlock through their parents', () => {
    expect(isUnlocked('fire', {})).toBe(true)
    expect(isUnlocked('magma', { fire: 1, earth: 2 })).toBe(false)
    expect(isUnlocked('magma', { fire: 2, earth: 2 })).toBe(true)
  })

  it('a church turns light into morale', () => {
    const s = { ...started(4), morale: 20 }
    const t = ownedTiles(s.map).find((x) => !x.building)!
    const built = placeBuilding({ ...s, stock: { ...s.stock, gold: 99, stone: 99 } }, t, 'church')
    expect(canOffer(built)).toBe(false)
    const lit = { ...built, stock: { ...built.stock, light: 10 } }
    expect(offerLight(lit).morale).toBe(20 + CONFIG.faith.moralePerOffering)
    expect(offerLight(lit).stock.light).toBe(10 - CONFIG.faith.lightPerOffering)
  })

  it('razing a camp claims its tile; fallen units die', () => {
    // Walk a strong troop up to a camp by claiming toward it.
    let s = started(12)
    const camp = s.map.tiles.find((t) => t.camp)!
    s = { ...s, stock: { ...s.stock, gold: 999 }, troop: Array.from({ length: 6 }, (_, i) => ({ ...mk({ type: 'tank', rarity: 'legendary' }, 5), uid: `x${i}` })) }
    for (let guard = 0; raidBlock(s, camp) === 'not-frontier' && guard < 20; guard++) {
      const step = frontier(s.map).filter((t) => !t.camp).sort((x, y) => hexDistance(x, camp) - hexDistance(y, camp))[0]!
      s = { ...s, map: { ...s.map, tiles: s.map.tiles.map((t) => (t.q === step.q && t.r === step.r ? { ...t, owned: true } : t)) } }
    }
    expect(raidBlock(s, camp)).toBeNull()
    const fought = raidCamp(s, camp)
    expect(fought.phase).toBe('battle')
    const after = finishBattle(fought)
    expect(tileAt(after.map, camp)!.owned).toBe(true)
    expect(tileAt(after.map, camp)!.camp).toBeNull()
  })
})

describe('full runs', () => {
  const play = (seed: number, sp: SpeciesId, style: BotStyle): GameState => {
    let s = started(seed, sp)
    const mem = {}
    for (let guard = 0; s.phase !== 'over' && guard < 200; guard++) {
      if (s.phase === 'battle') s = finishBattle(s)
      else s = endTurn(playTurn(s, style, mem))
    }
    return s
  }

  it('every species can play a whole game with both bot styles', () => {
    for (const sp of ['human', 'ork', 'goblin', 'dwarf', 'elf', 'golem', 'dragon'] as SpeciesId[]) {
      for (const style of ['tempo', 'synergy'] as BotStyle[]) {
        const s = play(2026, sp, style)
        expect(s.phase).toBe('over')
        if (s.victory) expect(s.history.every((h) => h.won)).toBe(true)
        else expect(s.history.at(-1)!.won).toBe(false)
      }
    }
  })

  it('is reproducible from a seed', () => {
    expect(play(77, 'human', 'synergy')).toEqual(play(77, 'human', 'synergy'))
  })
})

describe('food upkeep & civilization levels', () => {
  it('the starting city is fed and grows', () => {
    const s = started(4)
    expect(foodSurplus(s)).toBeGreaterThanOrEqual(0)
  })

  it('food demand grows slower than the crowd', () => {
    expect(foodDemand(1_000_000)).toBeLessThan(foodDemand(100) * 100)
    expect(foodDemand(1_000_000)).toBeGreaterThan(foodDemand(100))
  })

  it('famine stops growth and costs morale, but nobody dies', () => {
    const s = { ...started(4), population: 1_000_000 }
    expect(foodSurplus(s)).toBeLessThan(0)
    const next = endTurn(s)
    expect(next.population).toBe(s.population)
    expect(next.morale).toBeLessThan(s.morale + CONFIG.morale.regen)
  })

  it('population stops at the ceiling; an upgrade lifts it next turn', () => {
    let s = started(4)
    s = { ...s, population: popCap(s), stock: { ...s.stock, gold: 999, stone: 999 } }
    expect(civBlock(s)).toBeNull()
    s = upgradeCiv(s)
    expect(civBlock(s)).toBe('busy')
    expect(s.civLevel).toBe(0)
    const next = endTurn(s)
    expect(next.civLevel).toBe(1)
    expect(next.population).toBe(CONFIG.civ[0]!.popCap)
    expect(popCap(next)).toBe(CONFIG.civ[1]!.popCap)
  })

  it('an upgrade needs the resources', () => {
    const s = { ...started(4), stock: { ...started(4).stock, gold: 0 } }
    expect(civBlock(s)).toBe('missing')
    expect(upgradeCiv(s)).toBe(s)
  })
})
