/**
 * The title menu: Start game · Settings · Debugger. Behind it, a demo fight
 * loops in the arena (a real sim result, replayed).
 */
import { useMemo, useRef, useState } from 'react'
import { lineupUnits, parseLineup, simulateCombat } from '../../game'
import { useGame, useStore } from '../useGame'
import { Arena3D, type PlaybackClock } from '../battle/Arena3D'
import { Lexicon } from '../lexicon/Lexicon'
import { Credits } from '../Credits'
import { SPECIES_GLYPH } from '../theme'
import './title.css'

export function TitleScreen({ onStart, onDebug }: { onStart: () => void; onDebug: () => void }) {
  const [s] = useGame()
  const store = useStore()
  const [settings, setSettings] = useState(false)
  const [lexicon, setLexicon] = useState(false)
  const [credits, setCredits] = useState(false)
  const inRun = s.phase !== 'species' && s.phase !== 'over'

  return (
    <div className="title">
      <DemoFight />
      <div className="title-shade" />
      <div className="title-panel">
        <p className="title-kicker">A mini-Civ you win through combat</p>
        <h1 className="title-name">
          Halloween
          <br />
          Special
        </h1>
        <nav className="title-menu">
          {inRun && (
            <button onClick={onStart}>
              Continue
              <small>
                {s.species && SPECIES_GLYPH[s.species]} Round {s.round + 1}, turn {s.turn + 1}
              </small>
            </button>
          )}
          <button
            onClick={() => {
              if (inRun && !confirm('Abandon the current run and start a new one?')) return
              if (inRun || s.phase === 'over') store.reset()
              onStart()
            }}
          >
            {inRun ? 'New game' : 'Start game'}
            <small>Pick a people, build a city, survive five battles</small>
          </button>
          <button onClick={() => setSettings(!settings)} className={settings ? 'open' : ''}>
            Settings
            <small>Lexicon, credits</small>
          </button>
          {settings && (
            <div className="title-sub">
              <button onClick={() => setLexicon(true)}>📖 Lexicon</button>
              <button onClick={() => setCredits(true)}>✦ Credits</button>
            </div>
          )}
          <button onClick={onDebug}>
            Debugger tool
            <small>Build two troops and test combat tick by tick</small>
          </button>
        </nav>
      </div>
      {lexicon && <Lexicon onClose={() => setLexicon(false)} />}
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>
  )
}

/** A looping exhibition match behind the menu. */
function DemoFight() {
  const result = useMemo(
    () => simulateCombat({ units: lineupUnits(parseLineup('tank:rare,fighter@fire2,ranger,mage@water2,healer'), 'A') }, { units: lineupUnits(parseLineup('tank,fighter:rare,fighter,ranger@wind2,healer'), 'B') }, 4),
    [],
  )
  const clock = useRef<PlaybackClock>({ time: 0, speed: 1, paused: false })
  const overlay = useRef<HTMLDivElement>(null)
  return (
    <div className="title-bg">
      <Arena3D
        result={result}
        clock={clock}
        onTick={(t) => {
          // Hold the last frame a moment, then start over.
          if (t >= result.ticks) setTimeout(() => (clock.current.time = 0), 2500)
        }}
        selected={null}
        onSelect={() => {}}
        showAggro={false}
        showCells={false}
        overlay={overlay}
      />
      <div className="title-overlay" ref={overlay} />
    </div>
  )
}
