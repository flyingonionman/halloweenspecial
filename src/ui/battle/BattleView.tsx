/**
 * A fight on screen, like spectating a tiny MOBA match: the 3D arena in the
 * middle, a live scoreboard per side (damage, damage taken, healing, kills),
 * playback controls with a tick scrubber, a kill feed, and an inspector for
 * the selected unit (what it's doing this tick, who it's targeting and why)
 * above the combat log. Used by real battles and by the combat sandbox.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CONFIG,
  TYPE_DEFS,
  activity,
  cellLabel,
  describe,
  eventsUntil,
  primaryAffinity,
  tally,
  who,
  type CombatResult,
  type RosterEntry,
  type TargetReason,
} from '../../game'
import { AFFINITY_GLYPH, RARITY_COLOR, TYPE_GLYPH, unitColor } from '../theme'
import { Arena3D, TEAM_HUE, type PlaybackClock } from './Arena3D'
import { TPS, frameAt } from './playback'
import './battle.css'

const SPEEDS = [0.25, 0.5, 1, 2, 4]

const REASON: Record<TargetReason, string> = {
  tank: 'tanks first',
  nearest: 'nearest',
  taunt: 'taunted',
  heal: 'healing',
  hex: 'hexing',
}

interface Props {
  result: CombatResult
  /** Side names: [yours, theirs]. */
  names: [string, string]
  labels?: [string, string]
  /** Rendered over the stage (e.g. the verdict) once the fight has played out. */
  done?: (finished: boolean) => ReactNode
  /** Sandbox: aggro lines and the full log on by default. */
  debug?: boolean
  /** Extra buttons for the header (sandbox: back to the editor). */
  actions?: ReactNode
}

export function BattleView({ result, names, labels = ['Your troop', 'Opponent'], done, debug = false, actions }: Props) {
  const clock = useRef<PlaybackClock>({ time: 0, speed: 1, paused: false })
  const overlay = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [showAggro, setShowAggro] = useState(true)
  const [showCells, setShowCells] = useState(debug)
  const [showSteps, setShowSteps] = useState(false)
  const [logOpen, setLogOpen] = useState(debug)
  const finished = tick >= result.ticks

  // New fight → rewind.
  useEffect(() => {
    clock.current.time = 0
    clock.current.paused = false
    setPaused(false)
    setTick(0)
    setSelected(null)
  }, [result])

  const seek = (t: number) => {
    const clamped = Math.max(0, Math.min(result.ticks, t))
    clock.current.time = clamped / TPS
    setTick(clamped)
  }
  const pause = (p: boolean) => {
    clock.current.paused = p
    setPaused(p)
  }
  const stepBy = (d: number) => {
    pause(true)
    seek(Math.round(clock.current.time * TPS) + d)
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.key === ' ') {
        e.preventDefault()
        pause(!clock.current.paused)
      } else if (e.key === 'ArrowRight') stepBy(1)
      else if (e.key === 'ArrowLeft') stepBy(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const tallies = useMemo(() => tally(result, tick), [result, tick])
  const kills: [number, number] = [0, 0]
  result.roster.forEach((r) => (kills[r.team] += tallies[r.id]!.kills))
  const maxOut = Math.max(1, ...tallies.map((t) => t.dealt + t.healed))
  const overtime = tick > CONFIG.combat.overtimeAfter

  return (
    <div className="bv">
      <header className="bv-head">
        <div className="bv-side">
          <span className="side-label">{labels[0]}</span>
          <span className="side-name">{names[0]}</span>
        </div>
        <div className="bv-score">
          <b style={{ color: TEAM_HUE[0] }}>{kills[0]}</b>
          <span className="bv-clock">
            <span className="mono">
              {(tick / TPS).toFixed(1)}s · tick {tick}/{result.ticks}
            </span>
            {overtime && <em className="bv-ot" title="Past 30s damage ramps up and healing ramps down">Overtime</em>}
          </span>
          <b style={{ color: TEAM_HUE[1] }}>{kills[1]}</b>
        </div>
        <div className="bv-side them">
          <span className="side-label">{labels[1]}</span>
          <span className="side-name">{names[1]}</span>
        </div>
      </header>

      <div className="bv-controls">
        <button className="btn btn-small" onClick={() => seek(0)} title="Restart">
          ⏮
        </button>
        <button className="btn btn-small" onClick={() => stepBy(-1)} title="Back one tick (←)">
          ◀
        </button>
        <button className="btn btn-small bv-play" onClick={() => (finished ? (seek(0), pause(false)) : pause(!paused))} title="Play / pause (space)">
          {finished ? '↺' : paused ? '▶' : '❚❚'}
        </button>
        <button className="btn btn-small" onClick={() => stepBy(1)} title="Forward one tick (→)">
          ▶
        </button>
        <input
          className="bv-scrub"
          type="range"
          min={0}
          max={result.ticks}
          value={tick}
          onChange={(e) => {
            pause(true)
            seek(Number(e.target.value))
          }}
          aria-label="Scrub ticks"
        />
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            className={`btn btn-small ${speed === sp ? 'on' : ''}`}
            onClick={() => {
              clock.current.speed = sp
              setSpeed(sp)
            }}
          >
            {sp}×
          </button>
        ))}
        <button className="btn btn-small" onClick={() => seek(result.ticks)} disabled={finished} title="Skip to the end">
          ⏭
        </button>
        <span className="bv-sep" />
        <label className="bv-toggle" title="Lines from each unit to its target">
          <input type="checkbox" checked={showAggro} onChange={(e) => setShowAggro(e.target.checked)} /> Aggro
        </label>
        <label className="bv-toggle" title="Tint the cells units occupy (a step claims its next cell at once)">
          <input type="checkbox" checked={showCells} onChange={(e) => setShowCells(e.target.checked)} /> Cells
        </label>
        <label className="bv-toggle">
          <input type="checkbox" checked={logOpen} onChange={(e) => setLogOpen(e.target.checked)} /> Log
        </label>
        {actions}
      </div>

      <div className="bv-body">
        <Scoreboard result={result} team={0} tick={tick} tallies={tallies} maxOut={maxOut} selected={selected} onSelect={setSelected} />
        <div className="bv-stage">
          <Arena3D result={result} clock={clock} onTick={setTick} selected={selected} onSelect={setSelected} showAggro={showAggro} showCells={showCells} overlay={overlay} />
          <div className="bv-overlay" ref={overlay} />
          <KillFeed result={result} tick={tick} />
          {(selected !== null || logOpen) && (
            <div className="bv-bottom">
              {selected !== null && <Inspector result={result} id={selected} tick={tick} onClose={() => setSelected(null)} />}
              {logOpen && <CombatLog result={result} tick={tick} selected={selected} showSteps={showSteps} setShowSteps={setShowSteps} onSeek={(t) => (pause(true), seek(t))} />}
            </div>
          )}
          {done?.(finished)}
        </div>
        <Scoreboard result={result} team={1} tick={tick} tallies={tallies} maxOut={maxOut} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  )
}

function Scoreboard({
  result,
  team,
  tick,
  tallies,
  maxOut,
  selected,
  onSelect,
}: {
  result: CombatResult
  team: 0 | 1
  tick: number
  tallies: ReturnType<typeof tally>
  maxOut: number
  selected: number | null
  onSelect: (id: number) => void
}) {
  const f = frameAt(result, tick)
  const rows = result.roster.filter((r) => r.team === team)
  return (
    <div className={`bv-board team-${team}`}>
      <div className="sb-head">
        <span />
        <span>Unit</span>
        <span title="Damage dealt">Dmg</span>
        <span title="Damage taken">Tkn</span>
        <span title="Healing done">Heal</span>
        <span title="Kills">K</span>
      </div>
      {rows.map((r) => {
        const t = tallies[r.id]!
        const hp = f(r.id, 'hp')
        const sh = f(r.id, 'shield')
        const total = Math.max(r.maxHp, hp + sh)
        return (
          <button key={r.id} className={`sb-row ${hp <= 0 ? 'dead' : ''} ${selected === r.id ? 'sel' : ''}`} style={{ '--rarity': RARITY_COLOR[r.rarity] } as React.CSSProperties} onClick={() => onSelect(r.id)}>
            <span className="sb-glyph" style={{ color: unitColor(primaryAffinity(r.affinities)) }} title={TYPE_DEFS[r.type].label}>
              {TYPE_GLYPH[r.type]}
            </span>
            <span className="sb-name">
              <b>{r.name}</b>
              <small>
                <span style={{ color: RARITY_COLOR[r.rarity] }}>{r.rarity}</span> {TYPE_DEFS[r.type].label} · Lv{r.level}
                {primaryAffinity(r.affinities) && <> · {AFFINITY_GLYPH[primaryAffinity(r.affinities)!]}</>}
              </small>
              <span className="sb-hp">
                <i style={{ width: `${(hp / total) * 100}%` }} />
                <i className="sb-sh" style={{ left: `${(hp / total) * 100}%`, width: `${(sh / total) * 100}%` }} />
              </span>
              <span className="sb-out" title="Damage + healing, relative to the best in this fight">
                <i style={{ width: `${((t.dealt + t.healed) / maxOut) * 100}%` }} />
              </span>
            </span>
            <span className="mono">{t.dealt}</span>
            <span className="mono dim">{t.taken}</span>
            <span className="mono heal">{t.healed || ''}</span>
            <span className="mono">{t.kills || ''}</span>
          </button>
        )
      })}
    </div>
  )
}

function KillFeed({ result, tick }: { result: CombatResult; tick: number }) {
  const end = eventsUntil(result, tick)
  const deaths = []
  for (let i = end - 1; i >= 0 && deaths.length < 4; i--) {
    const e = result.events[i]!
    if (tick - e.t > 60) break
    if (e.kind === 'death') deaths.push(e)
  }
  return (
    <ul className="kill-feed">
      {deaths.map((e) => {
        const k = result.roster[e.by]!
        const v = result.roster[e.id]!
        return (
          <li key={`${e.t}-${e.id}`} style={{ opacity: Math.max(0.25, 1 - (tick - e.t) / 60) }}>
            <span style={{ color: TEAM_HUE[k.team] }}>
              {TYPE_GLYPH[k.type]} {short(k)}
            </span>
            <i>⚔</i>
            <span style={{ color: TEAM_HUE[v.team] }} className="victim">
              {TYPE_GLYPH[v.type]} {short(v)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const short = (r: RosterEntry) => (r.name.length > 14 ? r.name.split(' ')[0] : r.name)

function Inspector({ result, id, tick, onClose }: { result: CombatResult; id: number; tick: number; onClose: () => void }) {
  const r = result.roster[id]!
  const f = frameAt(result, tick)
  const target = f(id, 'target')
  // Why it's on that target: the latest target event for this unit.
  let reason: TargetReason | null = null
  for (let i = eventsUntil(result, tick) - 1; i >= 0; i--) {
    const e = result.events[i]!
    if (e.kind === 'target' && e.id === id) {
      reason = e.reason
      break
    }
  }
  const s = r.stats
  return (
    <section className="bv-inspect">
      <header>
        <span className="sb-glyph" style={{ color: unitColor(primaryAffinity(r.affinities)) }}>
          {TYPE_GLYPH[r.type]}
        </span>
        <b style={{ color: TEAM_HUE[r.team] }}>{r.name}</b>
        <small>
          {r.rarity} {TYPE_DEFS[r.type].label} · Lv{r.level} · cell {cellLabel(result, f(id, 'cell'))}
        </small>
        <button className="help-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <p className="bv-doing">
        <b>{activity(result, id, tick)}</b>
        {target >= 0 && target !== id && (
          <>
            {' '}
            · target <b style={{ color: TEAM_HUE[result.roster[target]!.team] }}>{who(result, target)}</b>
            {reason && <small> ({REASON[reason]})</small>}
          </>
        )}
      </p>
      <dl className="bv-stats">
        <div>
          <dt>HP</dt>
          <dd>
            {Math.round(f(id, 'hp'))}/{r.maxHp}
            {f(id, 'shield') > 0.5 && <small> +{Math.round(f(id, 'shield'))}</small>}
          </dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>
            {Math.round(f(id, 'energy'))}/{r.maxEnergy}
          </dd>
        </div>
        <div>
          <dt>ATK / DEF</dt>
          <dd>
            {s.atk} / {s.def}
          </dd>
        </div>
        <div>
          <dt>Reach</dt>
          <dd>
            {s.range} cell{s.range === 1 ? '' : 's'}
          </dd>
        </div>
        <div title="An attack occupies the unit this many ticks; it lands part way through">
          <dt>Attack</dt>
          <dd>every {r.attackTicks}t</dd>
        </div>
        <div title="One step to the next cell takes this many ticks">
          <dt>Step</dt>
          <dd>{r.moveTicks}t</dd>
        </div>
      </dl>
      <p className="bv-targeting">{TYPE_DEFS[r.type].targeting}</p>
    </section>
  )
}

function CombatLog({
  result,
  tick,
  selected,
  showSteps,
  setShowSteps,
  onSeek,
}: {
  result: CombatResult
  tick: number
  selected: number | null
  showSteps: boolean
  setShowSteps: (v: boolean) => void
  onSeek: (t: number) => void
}) {
  const ref = useRef<HTMLOListElement>(null)
  const end = eventsUntil(result, tick)
  const lines: { t: number; text: string; kind: string; i: number }[] = []
  for (let i = end - 1; i >= 0 && lines.length < 80; i--) {
    const e = result.events[i]!
    if (e.kind === 'move' && !showSteps) continue
    if (selected !== null) {
      const ids = 'id' in e ? [e.id, 'to' in e ? e.to : -1, 'by' in e ? e.by : -1] : [e.from, e.to]
      if (e.kind === 'skill' ? !(e.id === selected || e.targets.includes(selected)) : !ids.includes(selected)) continue
    }
    const text = describe(result, e)
    if (text) lines.push({ t: e.t, text, kind: e.kind, i })
  }
  lines.reverse()
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [end, selected, showSteps])
  return (
    <section className="bv-log">
      <header>
        <b>{selected !== null ? `Log · ${who(result, selected)}` : 'Combat log'}</b>
        <small>click a line to jump there · * = their side</small>
        <label className="bv-toggle">
          <input type="checkbox" checked={showSteps} onChange={(e) => setShowSteps(e.target.checked)} /> steps
        </label>
      </header>
      <ol ref={ref}>
        {lines.map((l) => (
          <li key={l.i} className={`log-${l.kind}`} onClick={() => onSeek(l.t)}>
            <span className="mono">t{l.t}</span> {l.text}
          </li>
        ))}
      </ol>
    </section>
  )
}
