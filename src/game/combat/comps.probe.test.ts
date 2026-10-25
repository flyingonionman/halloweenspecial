/**
 * Round-robin of every role mix (`npm run comps`): all multisets of COMP_SIZE
 * unit types, level-1 commons, no affinities, each against every other over
 * COMP_SEEDS seeds. Prints the best comps by win rate and by worst matchup.
 */
import { it } from 'vitest'
import { UNIT_TYPES, defaultSpec, lineupUnits, simulateCombat, type UnitType } from '../index'

declare const process: { env: Record<string, string | undefined> }
const SIZE = Number(process.env.COMP_SIZE ?? 6)
const SEEDS = Number(process.env.COMP_SEEDS ?? 2)

function comps(n: number, from = 0): UnitType[][] {
  if (n === 0) return [[]]
  const out: UnitType[][] = []
  for (let i = from; i < UNIT_TYPES.length; i++) for (const rest of comps(n - 1, i)) out.push([UNIT_TYPES[i]!, ...rest])
  return out
}

const label = (c: UnitType[]) => UNIT_TYPES.map((t) => [t, c.filter((x) => x === t).length] as const).filter(([, n]) => n).map(([t, n]) => `${n}${t[0]!.toUpperCase()}`).join(' ')

it('comps', () => {
  const all = comps(SIZE)
  const troops = all.map((c, i) => lineupUnits(c.map(defaultSpec), `c${i}-`))
  const n = all.length
  // score[i][j] = i's wins (+0.5 per draw) against j, over SEEDS fights
  const score = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        // alternate sides so neither comp always deploys west
        const [a, b] = seed % 2 ? [i, j] : [j, i]
        const w = simulateCombat({ units: troops[a]! }, { units: troops[b]! }, seed * 7919 + i * 31 + j).winner
        const pa = w === 'draw' ? 0.5 : w === 0 ? 1 : 0
        score[a]![b] = score[a]![b]! + pa
        score[b]![a] = score[b]![a]! + (1 - pa)
      }
    }
  }
  const rows = all.map((c, i) => {
    const rates = Array.from({ length: n }, (_, j) => (j === i ? null : score[i]![j]! / SEEDS)).filter((x): x is number => x !== null)
    const avg = rates.reduce((s, x) => s + x, 0) / rates.length
    const worst = Math.min(...rates)
    const losing = rates.filter((x) => x < 0.5).length
    return { comp: label(c), win: avg, worst, losing }
  })
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const show = (r: (typeof rows)[number]) => ({ comp: r.comp, 'win rate': pct(r.win), 'worst matchup': pct(r.worst), 'comps it loses to': r.losing })
  console.log(`${n} comps of ${SIZE}, ${SEEDS} seeds per pairing, ${(n * (n - 1) * SEEDS) / 2} fights`)
  console.log('\nTop 12 by overall win rate:')
  console.table([...rows].sort((a, b) => b.win - a.win).slice(0, 12).map(show))
  console.log('\nTop 8 by fewest losing matchups:')
  console.table([...rows].sort((a, b) => a.losing - b.losing || b.win - a.win).slice(0, 8).map(show))
  console.log('\nBottom 6:')
  console.table([...rows].sort((a, b) => a.win - b.win).slice(0, 6).map(show))
  // Average win rate of comps by how many of each type they have.
  const byType: Record<string, string> = {}
  for (const t of UNIT_TYPES) {
    const cells: string[] = []
    for (let k = 0; k <= SIZE; k++) {
      const pick = rows.filter((_, i) => all[i]!.filter((x) => x === t).length === k)
      if (pick.length) cells.push(`${k}:${pct(pick.reduce((s, r) => s + r.win, 0) / pick.length)}`)
    }
    byType[t] = cells.join('  ')
  }
  console.log('\nAverage win rate by count of each type (count:win%):')
  console.table(byType)
}, 3_600_000)
