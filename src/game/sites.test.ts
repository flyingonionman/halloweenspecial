import { describe, expect, it } from 'vitest'
import { CONFIG, SITE_DEFS, callMuster, chooseSpecies, recruit, endTurn, exploreSite, finishBattle, frontier, newGame, siteBlock, caravanTrade, type GameState, type SiteId } from './index'

const started = (seed: number) => chooseSpecies(newGame(seed), 'human')

/** A run with `id` placed on a border tile (and plenty of everything). */
function withSite(id: SiteId, seed = 4): [GameState, { q: number; r: number }] {
  const s = structuredClone(started(seed))
  for (const t of s.map.tiles) delete t.site
  const t = frontier(s.map).find((f) => !f.camp)!
  const tile = s.map.tiles.find((x) => x.q === t.q && x.r === t.r)!
  tile.site = id
  for (const k of Object.keys(s.stock) as (keyof GameState['stock'])[]) s.stock[k] = 50
  return [s, { q: t.q, r: t.r }]
}

describe('sites', () => {
  it('appear each round on wild tiles of their terrain', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sites = started(seed).map.tiles.filter((t) => t.site)
      expect(sites.length).toBeLessThanOrEqual(CONFIG.sites.perRound)
      for (const t of sites) {
        expect(t.owned).toBe(false)
        expect(t.camp).toBeNull()
        expect(SITE_DEFS[t.site!].terrains).toContain(t.terrain)
      }
    }
  })

  it('a sure option pays its cost, applies its effect, and the site is gone', () => {
    const [s, h] = withSite('shrine')
    const after = exploreSite(s, h, 1) // drain: 6 mud → 12 hydrocorals
    expect(after.stock.earth).toBe(s.stock.earth - 6)
    expect(after.stock.water).toBe(s.stock.water + 12)
    expect(after.map.tiles.find((t) => t.q === h.q && t.r === h.r)!.site).toBeUndefined()
  })

  it('options you cannot pay for, or that need a troop, are blocked', () => {
    const [s, h] = withSite('dwarfhold')
    expect(siteBlock({ ...s, troop: [] }, h, 0)).toBe('no-troop')
    const [c, ch] = withSite('champion')
    expect(siteBlock({ ...c, stock: { ...c.stock, fire: 0 } }, ch, 0)).toBe('cost')
  })

  it('a fight goes to the battle screen; winning claims the tile', () => {
    const [base, h] = withSite('dwarfhold')
    const called = callMuster({ ...base, morale: CONFIG.morale.max })
    const s = called.muster.reduce((x, c) => recruit(x, c.unit.uid), called)
    const fighting = exploreSite(s, h, 0)
    expect(fighting.phase).toBe('battle')
    const done = finishBattle(fighting)
    const tile = done.map.tiles.find((t) => t.q === h.q && t.r === h.r)!
    expect(tile.owned).toBe(fighting.battle!.outcome.won)
    expect(!!tile.site).toBe(!fighting.battle!.outcome.won)
  })

  it('a caravan trades 1:1, then moves on at the end of the turn', () => {
    const [s, h] = withSite('caravan')
    const traded = caravanTrade(s, h, 'stone', 'fire')
    expect(traded.stock.stone).toBe(s.stock.stone - 1)
    expect(traded.stock.fire).toBe(s.stock.fire + 1)
    expect(endTurn(traded).map.tiles.find((t) => t.q === h.q && t.r === h.r)!.site).toBeUndefined()
  })

  it('tribute adds food for a few turns', () => {
    const [s, h] = withSite('grove')
    const paid = exploreSite(s, h, 0)
    expect(paid.boons).toEqual([{ food: 3, turns: 3 }])
    let x = paid
    for (let i = 0; i < 3; i++) x = endTurn(x)
    expect(x.boons).toEqual([])
  })
})
