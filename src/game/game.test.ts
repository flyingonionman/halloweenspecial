import { describe, expect, it } from 'vitest'
import {
  AFFINITY_TERRAIN,
  CONFIG,
  affinityBirthWeights,
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
  doTask,
  endTurn,
  evaluateBuilding,
  finishBattle,
  frontier,
  generateMap,
  glory,
  hexDistance,
  isRanged,
  newGame,
  ownedTiles,
  placeBuilding,
  raidBlock,
  raidCamp,
  rarityOdds,
  simulateCombat,
  tileAt,
  troopSize,
  unitStats,
  unitUpgradeCost,
  upgradeCost,
  type Affinity,
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
  ...createUnit(`m${uidN++}`, { type: 'fighter', affinities: { sword: 1 }, rarity: 'common', quality: 1, ...roll }, new Rng(1)),
  level,
})

const started = (seed: number, species: SpeciesId = 'human') => chooseSpecies(newGame(seed), species)

/** A hand-made 3-tile strip for adjacency tests: centre plus two neighbours. */
function strip(centre: WorldMap['tiles'][number]['terrain'], east: WorldMap['tiles'][number]['terrain'], west: WorldMap['tiles'][number]['terrain']): WorldMap {
  const t = (q: number, terrain: typeof centre) => ({ q, r: 0, terrain, owned: true, building: null, camp: null })
  return { radius: 1, homeBiome: 'forest', tiles: [t(0, centre), t(1, east), t(-1, west)] }
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
    expect(upgradeCost({ ...fresh, battlesSurvived: 3 })!).toBeLessThan(upgradeCost(fresh)!)
    expect(upgradeCost(mk({}, CONFIG.level.max))).toBeNull()
  })
})

describe('population', () => {
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
})

describe('buildings & adjacency', () => {
  it('extractors gain from matching neighbours', () => {
    const lone = evaluateBuilding(strip('forest', 'plains', 'plains'), { q: 0, r: 0 }, 'lumber-camp')
    const grove = evaluateBuilding(strip('forest', 'forest', 'forest'), { q: 0, r: 0 }, 'lumber-camp')
    expect(lone.output.timber).toBe(2)
    expect(grove.output.timber).toBe(4)
  })

  it('barracks feed on adjacent mines', () => {
    const m = strip('plains', 'hills', 'plains')
    const before = evaluateBuilding(m, { q: 0, r: 0 }, 'barracks').output.atkPct!
    m.tiles[1]!.building = { id: 'mine', level: 1 }
    expect(evaluateBuilding(m, { q: 0, r: 0 }, 'barracks').output.atkPct!).toBeGreaterThan(before)
  })

  it('academies attune to their terrain and set the affinity level', () => {
    const m = strip('plains', 'volcanic', 'volcanic')
    m.tiles[0]!.building = { id: 'fire-academy', level: 2 }
    const c = city({ map: m })
    expect(c.affinityLevels.fire).toBe(2)
    expect(c.attune.fire).toBe(2)
  })

  it('placement respects terrain, ownership, uniqueness and cost', () => {
    let s = started(3)
    const plains = ownedTiles(s.map).find((t) => t.terrain === 'plains' && !t.building)
    const nonPlains = ownedTiles(s.map).find((t) => t.terrain !== 'plains' && t.terrain !== 'lake' && !t.building)
    if (nonPlains) expect(buildBlock(s, nonPlains, 'farm')).toBe('terrain')
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
  it('land shapes affinities', () => {
    const weights = (a: Affinity) => Object.fromEntries(['sword', 'shield', 'bow', 'arcane', 'fire', 'frost', 'wind', 'earth'].map((x) => [x, x === a ? 30 : 1])) as Record<Affinity, number>
    const born = birthCitizens({ population: 100, species: null, affinityWeights: weights('frost'), affinityLevels: {} }, 400, new Rng(2), counter(), 0)
    const frost = born.filter((c) => c.unit.affinities.frost).length
    expect(frost / 400).toBeGreaterThan(0.6)
    // mutations still happen
    expect(born.some((c) => !c.unit.affinities.frost)).toBe(true)
  })

  it('owning more of a terrain raises its affinity birth weight', () => {
    const s = started(21)
    const before = affinityBirthWeights(city(s)).frost
    const map = { ...s.map, tiles: s.map.tiles.map((t) => (t.owned && !t.building ? { ...t, terrain: AFFINITY_TERRAIN.frost } : t)) }
    expect(affinityBirthWeights(city({ map })).frost).toBeGreaterThan(before)
  })
})

describe('species', () => {
  it('troop sizes, vitality, rarity shift, upgrade costs', () => {
    expect(troopSize(started(1, 'goblin'))).toBe(CONFIG.troopSize + 2)
    expect(troopSize(started(1, 'dragon'))).toBe(CONFIG.troopSize - 2)
    expect(started(1, 'feline').maxHp).toBe(150)
    expect(birthRarityOdds(100, 'dragon').common).toBe(0)
    const u = mk({ rarity: 'epic' })
    expect(unitUpgradeCost(started(1, 'golem'), u)!).toBeLessThan(unitUpgradeCost(started(1, 'human'), u)!)
  })

  it('orks are born twice as fast; dwarves rarely see ranged', () => {
    const births = (sp: SpeciesId) => {
      const s = started(8, sp)
      return endTurn(s).muster.length - s.muster.length
    }
    expect(births('ork')).toBeGreaterThan(births('human'))
    const s = started(9, 'dwarf')
    const born = birthCitizens({ population: 100, species: 'dwarf', affinityWeights: affinityBirthWeights(city(s)), affinityLevels: {} }, 300, new Rng(1), counter(), 0)
    expect(born.filter((c) => isRanged(c.unit.type)).length / 300).toBeLessThan(0.12)
  })
})

describe('synergies', () => {
  it('tiers come from points, strength from academy level', () => {
    const troop = [mk({ affinities: { fire: 2 } }), mk({ affinities: { fire: 2 } })]
    const fire = (lvl: number) => computeSynergies(troop, { fire: lvl }).find((s) => s.def.id === 'fire')!
    expect(fire(0).tier).toBe(2)
    expect(fire(4).effects.bonusMagic!).toBeGreaterThan(fire(0).effects.bonusMagic!)
  })

  it('sword + shield combine into knight at the lower tier; effects go to carriers only', () => {
    const mage = mk({ type: 'mage', affinities: { sword: 2 } })
    const troop = [mage, mk({ affinities: { shield: 2, sword: 2 } }), mk({ type: 'tank', affinities: { earth: 1 } })]
    const syn = computeSynergies(troop)
    expect(syn.find((s) => s.def.id === 'knight')!.tier).toBe(1)
    expect(combatStats(mage, syn).atk).toBeGreaterThan(combatStats(mage, []).atk)
    expect(combatStats(mage, syn).damage).toBe('magic')
    expect(combatStats(troop[2]!, syn).atk).toBe(combatStats(troop[2]!, []).atk)
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
})

describe('turns & deeds', () => {
  it('a turn collects yields, grows, and births citizens', () => {
    const s = started(4)
    const next = endTurn(s)
    expect(next.turn).toBe(1)
    expect(next.population).toBeGreaterThan(s.population)
    expect(next.stock.gold).toBeGreaterThan(s.stock.gold)
  })

  it('an empty troop can still march, and forfeits', () => {
    let s = started(4)
    while (s.phase === 'turn') s = endTurn(s)
    expect(s.phase).toBe('battle')
    expect(s.battle!.outcome.won).toBe(false)
    expect(s.battle!.outcome.damage).toBeGreaterThan(0)
  })

  it('only one deed per turn', () => {
    let s = started(4)
    const [a, b] = s.tasks
    s = doTask(s, a!.id)
    expect(s.deedDone).toBe(true)
    expect(doTask(s, b!.id)).toBe(s)
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
    for (const sp of ['human', 'ork', 'goblin', 'feline', 'dwarf', 'elf', 'golem', 'dragon'] as SpeciesId[]) {
      for (const style of ['tempo', 'synergy'] as BotStyle[]) {
        const s = play(2026, sp, style)
        expect(s.phase).toBe('over')
        expect(glory(s)).toBeGreaterThan(0)
        if (s.victory) expect(s.history).toHaveLength(CONFIG.rounds)
        else expect(s.hp).toBe(0)
      }
    }
  })

  it('is reproducible from a seed', () => {
    expect(play(77, 'human', 'synergy')).toEqual(play(77, 'human', 'synergy'))
  })
})
