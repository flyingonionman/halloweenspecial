import { useCallback, useRef, useState } from 'react'
import { CONFIG, FRAME_STRIDE, RESOURCE_LABEL, TYPE_DEFS, finishBattle, primaryAffinity, type Material, type RosterEntry } from '../../game'
import { useGame } from '../useGame'
import { BattleCanvas, type PlaybackClock } from '../battle/BattleCanvas'
import { AFFINITY_COLOR, RARITY_COLOR, TYPE_GLYPH } from '../theme'
import { UnitCard } from '../components/UnitCard'

const SPEEDS = [1, 2, 4]

export function BattleScreen() {
  const [s, dispatch] = useGame()
  const battle = s.battle!
  const { result, outcome, name, kind } = battle
  const skirmish = kind === 'skirmish'
  const lootText = [
    outcome.gold ? `+${outcome.gold} gold` : '',
    ...(Object.entries(outcome.loot) as [Material, number][]).map(([k, v]) => `+${v} ${RESOURCE_LABEL[k]}`),
    outcome.claimed ? 'the tile is yours' : '',
  ].filter(Boolean)
  const clock = useRef<PlaybackClock>({ time: 0, speed: 1, paused: false })
  const [frameIndex, setFrameIndex] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const done = frameIndex >= result.frames.length - 1

  const onTick = useCallback((fi: number) => setFrameIndex(fi), [])
  const frame = result.frames[frameIndex]!

  const mine = result.roster.filter((r) => r.team === 0)
  const theirs = result.roster.filter((r) => r.team === 1)

  return (
    <div className="battle">
      <header className="battle-head">
        <div className="side side-you">
          <span className="side-label">Your troop</span>
          <span className="side-name">{skirmish ? `Raid · turn ${s.turn + 1}` : `Round ${s.round + 1}`}</span>
        </div>
        <div className="battle-clock">
          <span>{(frameIndex * result.tick).toFixed(1)}s</span>
          <div className="battle-controls">
            <button
              className="btn btn-small"
              onClick={() => {
                clock.current.paused = !paused
                setPaused(!paused)
              }}
              disabled={done}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
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
            <button className="btn btn-small" onClick={() => (clock.current.time = result.duration)} disabled={done}>
              Skip
            </button>
          </div>
        </div>
        <div className="side side-them">
          <span className="side-label">{skirmish ? 'Camp' : 'Opposing civ'}</span>
          <span className="side-name">{name}</span>
        </div>
      </header>

      <div className="battle-body">
        <Roster entries={mine} frame={frame} />
        <div className="battle-stage">
          <BattleCanvas result={result} clock={clock} onTick={onTick} />
          {done && (
            <div className={`verdict ${outcome.won ? 'won' : 'lost'}`}>
              <h2>{outcome.won ? (skirmish ? 'Razed' : 'Victory') : outcome.draw ? 'Stalemate' : skirmish ? 'Repelled' : 'Defeat'}</h2>
              <p>
                {outcome.won
                  ? `The field is yours${lootText.length ? `: ${lootText.join(', ')}` : ''}.`
                  : skirmish
                    ? `${outcome.enemySurvivors} of them still hold the camp. Your civilization is unharmed.`
                    : `${outcome.enemySurvivors} of theirs still stand. Your civilization loses ${outcome.damage} vitality.`}
              </p>
              {outcome.fallen.length > 0 && (
                <div className="fallen">
                  <h3>
                    The fallen ({outcome.fallen.length}):{' '}
                    {outcome.fallenReturn ? 'elven rites will bring them back' : 'they will not return'}
                  </h3>
                  <div className="fallen-list">
                    {outcome.fallen.map((u) => (
                      <UnitCard key={u.uid} unit={u} compact dim={!outcome.fallenReturn} />
                    ))}
                  </div>
                </div>
              )}
              <button className="btn btn-primary" onClick={() => dispatch(finishBattle)}>
                {skirmish
                  ? 'Return to the city'
                  : s.hp - outcome.damage <= 0
                    ? 'Accept your fate'
                    : s.round >= CONFIG.rounds - 1
                      ? 'Claim the age'
                      : 'Onward to the next age'}
              </button>
            </div>
          )}
        </div>
        <Roster entries={theirs} frame={frame} />
      </div>
    </div>
  )
}

function Roster({ entries, frame }: { entries: RosterEntry[]; frame: Float32Array }) {
  return (
    <ul className="roster">
      {entries.map((r) => {
        const hp = frame[r.id * FRAME_STRIDE + 2]!
        const frac = Math.max(0, hp / r.maxHp)
        return (
          <li key={r.id} className={hp <= 0 ? 'dead' : ''} style={{ '--rarity': RARITY_COLOR[r.rarity] } as React.CSSProperties}>
            <span className="r-glyph" style={{ color: AFFINITY_COLOR[primaryAffinity(r.affinities)] }}>
              {TYPE_GLYPH[r.type]}
            </span>
            <span className="r-name">
              {r.name}
              <small>
                {r.rarity} {TYPE_DEFS[r.type].label} · Lv{r.level}
              </small>
            </span>
            <span className="r-hp">
              <i style={{ width: `${frac * 100}%` }} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}
