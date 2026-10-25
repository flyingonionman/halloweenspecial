/**
 * Combat from the command line (`npm run sim`). Not part of `npm test`.
 *
 *   SIM_A="tank,fighter,ranger"  SIM_B="fighter:rare,mage@fire2"  npm run sim
 *   SIM_SEED=7     which seed (default 1)
 *   SIM_LOG=1      print the tick-by-tick log (SIM_LOG=moves to include steps)
 *   SIM_RUNS=200   run that many seeds and print win rates instead
 *
 * Unit spec: type[:rarity][:level][@affinity[points]] (see combat/lineup.ts).
 */
import { it } from 'vitest'
import { formatCombat, lineupUnits, parseLineup, simulateCombat, tally } from '../index'

declare const process: { env: Record<string, string | undefined> }
const env = process.env

it('sim', () => {
  const a = lineupUnits(parseLineup(env.SIM_A ?? 'tank,fighter,ranger,mage,healer'), 'a')
  const b = lineupUnits(parseLineup(env.SIM_B ?? 'tank,fighter,fighter,ranger,healer'), 'b')
  const runs = Number(env.SIM_RUNS ?? 0)
  if (runs > 0) {
    const wins = { 0: 0, 1: 0, draw: 0 }
    let ticks = 0
    const dealt = new Map<string, number>()
    for (let seed = 1; seed <= runs; seed++) {
      const r = simulateCombat({ units: a }, { units: b }, seed)
      wins[r.winner]++
      ticks += r.ticks
      tally(r).forEach((x, i) => {
        const key = `${r.roster[i]!.team === 0 ? 'A' : 'B'} ${r.roster[i]!.type}`
        dealt.set(key, (dealt.get(key) ?? 0) + x.dealt + x.healed)
      })
    }
    console.log(`A wins ${pct(wins[0], runs)} · B wins ${pct(wins[1], runs)} · draws ${pct(wins.draw, runs)} · avg ${(ticks / runs).toFixed(0)} ticks`)
    console.table(Object.fromEntries([...dealt].map(([k, v]) => [k, { 'avg damage+healing': Math.round(v / runs) }])))
    return
  }
  const r = simulateCombat({ units: a }, { units: b }, Number(env.SIM_SEED ?? 1))
  console.log(formatCombat(r, { log: !!env.SIM_LOG, moves: env.SIM_LOG === 'moves' }))
})

const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`
