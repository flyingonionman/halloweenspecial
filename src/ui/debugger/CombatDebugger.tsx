/**
 * The combat debugger (title menu → Debugger, or `?debug`): build two troops
 * by hand, pick a seed, and watch the fight in the full battle view with
 * aggro lines, occupied cells and the log on. "Run N seeds" gives win rates.
 * Lineups round-trip as spec strings, the same ones `npm run sim` takes.
 */
import { useMemo, useState } from 'react'
import {
  AFFINITY_DEFS,
  AFFINITY_LABEL,
  RARITIES,
  TYPE_DEFS,
  UNIT_TYPES,
  affinitiesOfTier,
  defaultSpec,
  formatSpec,
  lineupUnits,
  parseLineup,
  simulateCombat,
  tally,
  type Affinity,
  type CombatResult,
  type CombatSide,
  type Rarity,
  type UnitSpec,
  type UnitType,
} from '../../game'
import { BattleView } from '../battle/BattleView'
import { TEAM_HUE } from '../battle/Arena3D'
import { AFFINITY_COLOR, AFFINITY_GLYPH, RARITY_COLOR, TYPE_GLYPH } from '../theme'
import './debugger.css'

const PRESETS: Record<string, string> = {
  'Balanced five': 'tank,fighter,ranger,mage,healer',
  'Bruisers': 'tank,fighter,fighter,fighter',
  'Backline': 'tank,ranger,ranger,mage,mage',
  'No tanks': 'fighter,fighter,ranger,mage',
  'Double heal': 'tank,fighter,ranger,healer,healer',
  'Elite trio': 'tank:epic:3,fighter:epic:3,mage:epic:3',
  'Fire troop': 'tank@fire2,fighter@fire2,fighter@fire2,mage@fire2,ranger@fire',
}

const STORE = 'hs-debugger'

interface Side {
  specs: UnitSpec[]
  /** Academy level for every affinity on this side (synergy strength, research bonus). */
  level: number
}

function load(): [Side, Side] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as { a: string; b: string; la: number; lb: number } | null
    if (raw) return [{ specs: parseLineup(raw.a), level: raw.la }, { specs: parseLineup(raw.b), level: raw.lb }]
  } catch {
    /* fall through to defaults */
  }
  return [
    { specs: parseLineup(PRESETS['Balanced five']!), level: 1 },
    { specs: parseLineup('tank,fighter,fighter,ranger,healer'), level: 1 },
  ]
}

const sideOf = (side: Side, prefix: string): CombatSide => {
  const units = lineupUnits(side.specs, prefix)
  const affinityLevels: Partial<Record<Affinity, number>> = {}
  for (const s of side.specs) if (s.affinity) affinityLevels[s.affinity] = side.level
  return { units, bonuses: { affinityLevels, hpMult: 1, atkMult: 1, defMult: 1 } }
}

export function CombatDebugger({ onExit }: { onExit: () => void }) {
  const [sides, setSides] = useState<[Side, Side]>(load)
  const [seed, setSeed] = useState(1)
  const [result, setResult] = useState<CombatResult | null>(null)
  const [batch, setBatch] = useState<BatchResult | null>(null)
  const [runs, setRuns] = useState(200)

  const save = (next: [Side, Side]) => {
    setSides(next)
    setBatch(null)
    try {
      localStorage.setItem(STORE, JSON.stringify({ a: next[0].specs.map(formatSpec).join(','), b: next[1].specs.map(formatSpec).join(','), la: next[0].level, lb: next[1].level }))
    } catch {
      /* storage blocked: the lineup just won't be remembered */
    }
  }
  const setSide = (i: 0 | 1, side: Side) => save(i === 0 ? [side, sides[1]] : [sides[0], side])

  const fight = (s = seed) => {
    setSeed(s)
    setResult(simulateCombat(sideOf(sides[0], 'A'), sideOf(sides[1], 'B'), s))
  }

  if (result) {
    return (
      <div className="dbg dbg-watch">
        <BattleView
          key={result.seed}
          debug
          result={result}
          names={['Team A', 'Team B']}
          labels={[sides[0].specs.map(formatSpec).join(', '), sides[1].specs.map(formatSpec).join(', ')]}
          actions={
            <>
              <span className="bv-sep" />
              <span className="dbg-seed mono">seed {result.seed}</span>
              <button className="btn btn-small" onClick={() => fight(seed + 1)} title="Same teams, next seed">
                Seed +1
              </button>
              <button className="btn btn-small" onClick={() => setResult(null)}>
                ✎ Edit teams
              </button>
            </>
          }
          done={(finished) =>
            finished && (
              <div className="dbg-verdict">
                <b style={{ color: result.winner === 'draw' ? undefined : TEAM_HUE[result.winner] }}>{result.winner === 'draw' ? 'Draw' : `Team ${result.winner === 0 ? 'A' : 'B'} wins`}</b>
                <small>
                  {result.ticks} ticks · {result.duration.toFixed(1)}s
                </small>
              </div>
            )
          }
        />
      </div>
    )
  }

  return (
    <div className="dbg">
      <header className="dbg-head">
        <button className="btn btn-ghost" onClick={onExit}>
          ← Menu
        </button>
        <div>
          <h1>Combat debugger</h1>
          <p>Build two troops, pick a seed, watch it tick by tick. Same seed, same fight. Lineups match <code>npm run sim</code> specs.</p>
        </div>
      </header>

      <div className="dbg-body">
        <TeamEditor index={0} side={sides[0]} onChange={(s) => setSide(0, s)} />
        <div className="dbg-mid">
          <label className="dbg-field">
            <span>Seed</span>
            <span className="dbg-seedrow">
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
              <button className="btn btn-small" title="Random seed" onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>
                🎲
              </button>
            </span>
          </label>
          <button className="btn btn-war dbg-fight" disabled={!sides[0].specs.length || !sides[1].specs.length} onClick={() => fight()}>
            Fight ⚔
          </button>
          <button className="btn btn-small" onClick={() => save([sides[1], sides[0]])} title="Swap the two teams">
            ⇄ Swap sides
          </button>
          <div className="dbg-batch">
            <label className="dbg-field">
              <span>Batch</span>
              <span className="dbg-seedrow">
                <input type="number" value={runs} min={1} max={2000} onChange={(e) => setRuns(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))} />
                <button className="btn btn-small" disabled={!sides[0].specs.length || !sides[1].specs.length} onClick={() => setBatch(runBatch(sides, runs))}>
                  Run seeds
                </button>
              </span>
            </label>
            {batch && <BatchView b={batch} />}
          </div>
        </div>
        <TeamEditor index={1} side={sides[1]} onChange={(s) => setSide(1, s)} />
      </div>
    </div>
  )
}

function TeamEditor({ index, side, onChange }: { index: 0 | 1; side: Side; onChange: (s: Side) => void }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const specText = side.specs.map(formatSpec).join(', ')
  const update = (i: number, patch: Partial<UnitSpec>) => onChange({ ...side, specs: side.specs.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const tiers = useMemo(() => [1, 2, 3, 4].map((t) => affinitiesOfTier(t)), [])

  return (
    <section className={`dbg-team team-${index}`}>
      <h2 style={{ color: TEAM_HUE[index] }}>Team {index === 0 ? 'A' : 'B'}</h2>
      <div className="dbg-tools">
        <select value="" onChange={(e) => e.target.value && onChange({ ...side, specs: parseLineup(PRESETS[e.target.value]!) })}>
          <option value="">Preset…</option>
          {Object.keys(PRESETS).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <label title="Academy level for every affinity this side carries (0–4): scales synergies and gives +5% HP/ATK per level">
          Academy Lv
          <select value={side.level} onChange={(e) => onChange({ ...side, level: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>

      <ul className="dbg-units">
        {side.specs.map((s, i) => (
          <li key={i}>
            <span className="dbg-glyph" style={{ color: s.affinity ? AFFINITY_COLOR[s.affinity] : undefined }}>
              {TYPE_GLYPH[s.type]}
            </span>
            <select value={s.type} onChange={(e) => update(i, { type: e.target.value as UnitType })}>
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_DEFS[t].label}
                </option>
              ))}
            </select>
            <select value={s.rarity} style={{ color: RARITY_COLOR[s.rarity] }} onChange={(e) => update(i, { rarity: e.target.value as Rarity })}>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select value={s.level} onChange={(e) => update(i, { level: Number(e.target.value) })} title="Level">
              {[1, 2, 3, 4, 5].map((l) => (
                <option key={l} value={l}>
                  Lv{l}
                </option>
              ))}
            </select>
            <select value={s.affinity ?? ''} onChange={(e) => update(i, { affinity: (e.target.value || null) as Affinity | null })} title="Affinity">
              <option value="">no affinity</option>
              {tiers.map((as, t) => (
                <optgroup key={t} label={`Tier ${t + 1}`}>
                  {as.map((a) => (
                    <option key={a} value={a}>
                      {AFFINITY_GLYPH[a]} {AFFINITY_LABEL[a]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select value={s.points} disabled={!s.affinity} onChange={(e) => update(i, { points: Number(e.target.value) })} title="Affinity points">
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  ×{p}
                </option>
              ))}
            </select>
            <button className="btn btn-small btn-ghost" onClick={() => onChange({ ...side, specs: side.specs.filter((_, j) => j !== i) })} aria-label="Remove">
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="dbg-add">
        {UNIT_TYPES.map((t) => (
          <button key={t} className="btn btn-small" disabled={side.specs.length >= 12} onClick={() => onChange({ ...side, specs: [...side.specs, defaultSpec(t)] })}>
            + {TYPE_GLYPH[t]} {TYPE_DEFS[t].label}
          </button>
        ))}
      </div>

      <label className="dbg-field dbg-spec">
        <span>Spec (type:rarity:level@affinityN, …)</span>
        <input
          value={text ?? specText}
          onChange={(e) => {
            setText(e.target.value)
            try {
              const specs = parseLineup(e.target.value)
              setError(null)
              onChange({ ...side, specs })
            } catch (err) {
              setError((err as Error).message)
            }
          }}
          onBlur={() => setText(null)}
          spellCheck={false}
        />
        {error && <small className="dbg-err">{error}</small>}
      </label>
      {side.specs.some((s) => s.affinity && AFFINITY_DEFS[s.affinity].tier > 1) && side.level === 0 && (
        <p className="dbg-note">Academy Lv 0: synergies count points but scale weakly.</p>
      )}
    </section>
  )
}

interface BatchResult {
  runs: number
  wins: [number, number, number]
  avgTicks: number
  rows: { key: string; team: 0 | 1; dealt: number; taken: number; healed: number; deaths: number }[]
}

function runBatch(sides: [Side, Side], runs: number): BatchResult {
  const a = sideOf(sides[0], 'A')
  const b = sideOf(sides[1], 'B')
  const wins: [number, number, number] = [0, 0, 0]
  let ticks = 0
  const rows = new Map<string, BatchResult['rows'][number]>()
  for (let seed = 1; seed <= runs; seed++) {
    const r = simulateCombat(a, b, seed)
    wins[r.winner === 'draw' ? 2 : r.winner]++
    ticks += r.ticks
    tally(r).forEach((t, i) => {
      const e = r.roster[i]!
      const key = `${e.team === 0 ? 'A' : 'B'} ${e.name}`
      const row = rows.get(key) ?? { key, team: e.team, dealt: 0, taken: 0, healed: 0, deaths: 0 }
      row.dealt += t.dealt
      row.taken += t.taken
      row.healed += t.healed
      row.deaths += t.diedAt === null ? 0 : 1
      rows.set(key, row)
    })
  }
  return { runs, wins, avgTicks: ticks / runs, rows: [...rows.values()] }
}

function BatchView({ b }: { b: BatchResult }) {
  const pct = (n: number) => `${Math.round((n / b.runs) * 100)}%`
  return (
    <div className="dbg-batch-out">
      <div className="dbg-rates">
        <span style={{ color: TEAM_HUE[0] }}>A {pct(b.wins[0])}</span>
        <span style={{ color: TEAM_HUE[1] }}>B {pct(b.wins[1])}</span>
        <span>draw {pct(b.wins[2])}</span>
      </div>
      <div className="dbg-bar">
        <i style={{ width: pct(b.wins[0]), background: TEAM_HUE[0] }} />
        <i style={{ width: pct(b.wins[2]), background: '#6f6455' }} />
        <i style={{ width: pct(b.wins[1]), background: TEAM_HUE[1] }} />
      </div>
      <small>
        {b.runs} seeds · avg {(b.avgTicks / 10).toFixed(1)}s
      </small>
      <table>
        <thead>
          <tr>
            <th>avg per fight</th>
            <th>dmg</th>
            <th>taken</th>
            <th>heal</th>
            <th>died</th>
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r) => (
            <tr key={r.key}>
              <td style={{ color: TEAM_HUE[r.team] }}>{r.key}</td>
              <td>{Math.round(r.dealt / b.runs)}</td>
              <td>{Math.round(r.taken / b.runs)}</td>
              <td>{Math.round(r.healed / b.runs) || ''}</td>
              <td>{pct(r.deaths)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
