import { describe, expect, it } from 'vitest'
import { CONFIG, activeOmen, callMuster, chooseSpecies, endTurn, finishBattle, growthRate, moraleRegen, musterCost, newGame, type GameState } from './index'

const started = (seed: number) => chooseSpecies(newGame(seed), 'human')

/** Play through every round's turns (battles resolved, losses ignored) and collect the omens. */
function omensOfRun(seed: number) {
  let s = started(seed)
  for (let r = 0; r < CONFIG.rounds - 1; r++) {
    while (s.phase === 'turn') s = endTurn(s)
    // force a win so the run goes on
    s = finishBattle({ ...s, battle: { ...s.battle!, outcome: { ...s.battle!.outcome, won: true, draw: false } } })
  }
  return s.omens ?? {}
}

describe('omens', () => {
  it('one per round, only between the first and last, never repeated', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const omens = omensOfRun(seed)
      const rounds = Object.keys(omens).map(Number)
      expect(rounds.every((r) => r >= 1 && r <= CONFIG.rounds - 2)).toBe(true)
      expect(rounds.length).toBe(CONFIG.rounds - 2)
      expect(new Set(Object.values(omens)).size).toBe(rounds.length)
    }
  })

  it('the next round’s omen is known a round ahead', () => {
    const s = started(3)
    expect(activeOmen(s)).toBeNull()
    expect(s.omens?.[1]).toBeDefined()
  })

  it('plague: free recruiting, half growth', () => {
    const base: GameState = { ...started(2), round: 1, omens: {} }
    const plague: GameState = { ...base, omens: { 1: 'plague' } }
    expect(musterCost(plague)).toBe(0)
    expect(callMuster({ ...plague, morale: 0 }).muster.length).toBeGreaterThan(0)
    expect(growthRate(plague)).toBeCloseTo(growthRate(base) / 2)
  })

  it('war fever stops morale regen; pilgrims add to it', () => {
    const base: GameState = { ...started(2), round: 1, omens: {} }
    expect(moraleRegen({ ...base, omens: { 1: 'warFever' } })).toBe(0)
    expect(moraleRegen({ ...base, omens: { 1: 'pilgrims' } })).toBe(moraleRegen(base) + 3)
  })
})
