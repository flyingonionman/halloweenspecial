/**
 * Balance probe (`npm run balance`): a greedy bot that ignores synergies plays
 * N seeded runs and reports win rate per round. Not part of `npm test`.
 */
import { it } from 'vitest'
import { CONFIG, build, buyUnit, endEra, finishBattle, newGame, unitPower, upgradeUnit, type GameState } from './index'

const RUNS = 200

const playEra = (s: GameState): GameState => {
  s = build(s, 'market')
  const byPower = [...s.shop].sort((a, b) => unitPower(b.unit) - unitPower(a.unit))
  for (const o of byPower) if (s.troop.length < CONFIG.troopSize) s = buyUnit(s, o.unit.uid)
  for (const u of s.troop) s = upgradeUnit(s, u.uid)
  return endEra(s)
}

it('balance probe', () => {
  const wins = Array(CONFIG.rounds).fill(0)
  const played = Array(CONFIG.rounds).fill(0)
  const seconds = Array(CONFIG.rounds).fill(0)
  let victories = 0

  for (let seed = 1; seed <= RUNS; seed++) {
    let s = newGame(seed)
    while (s.phase !== 'over') {
      if (s.phase === 'battle') {
        played[s.round]++
        seconds[s.round] += s.battle!.result.duration
        if (s.battle!.outcome.won) wins[s.round]++
        s = finishBattle(s)
      } else s = playEra(s)
    }
    if (s.victory) victories++
  }

  console.table(
    played.map((n, r) => ({
      round: r + 1,
      reached: n,
      winRate: n ? `${Math.round((wins[r] / n) * 100)}%` : '-',
      avgSeconds: n ? (seconds[r] / n).toFixed(1) : '-',
    })),
  )
  console.log(`Full-run victories: ${victories}/${RUNS}`)
}, 120_000)
