/**
 * Balance probe (`npm run balance`): scripted bots play N seeded runs per
 * species and report round win rates, full clears, population and land.
 * Not part of `npm test`.
 */
import { it } from 'vitest'
import { CONFIG, chooseSpecies, endTurn, finishBattle, newGame, ownedTiles, SPECIES_IDS } from './index'
import { playTurn, type BotStyle } from './testing/bot'

declare const process: { env: Record<string, string | undefined> }

/** PROBE_RUNS=60 PROBE_SPECIES=all npm run balance for the full sweep. */
const RUNS = Number(process.env.PROBE_RUNS ?? 10)
const SPECIES = process.env.PROBE_SPECIES === 'all' ? SPECIES_IDS : (process.env.PROBE_SPECIES ?? 'human,dragon').split(',')

function run(style: BotStyle, species: (typeof SPECIES_IDS)[number]) {
  const wins = Array(CONFIG.rounds).fill(0)
  const played = Array(CONFIG.rounds).fill(0)
  let clears = 0
  let pop = 0
  let tiles = 0
  for (let seed = 1; seed <= RUNS; seed++) {
    let s = chooseSpecies(newGame(seed), species)
    const mem = {}
    while (s.phase !== 'over') {
      if (s.phase === 'battle') {
        if (s.battle!.kind === 'round') {
          played[s.round]++
          if (s.battle!.outcome.won) wins[s.round]++
        }
        s = finishBattle(s)
      } else s = endTurn(playTurn(s, style, mem))
    }
    if (s.victory) clears++
    pop += Math.log10(s.population)
    tiles += ownedTiles(s.map).length
  }
  return {
    ...Object.fromEntries(played.map((n, r) => [`R${r + 1}`, n ? `${Math.round((wins[r] / n) * 100)}%` : '-'])),
    clears: `${Math.round((clears / RUNS) * 100)}%`,
    pop: `10^${(pop / RUNS).toFixed(1)}`,
    tiles: Math.round(tiles / RUNS),
  }
}

it('balance probe', () => {
  const rows: Record<string, object> = {}
  for (const sp of SPECIES as (typeof SPECIES_IDS)[number][]) {
    rows[`${sp} tempo`] = run('tempo', sp)
    rows[`${sp} synergy`] = run('synergy', sp)
  }
  console.table(rows)
}, 600_000)
