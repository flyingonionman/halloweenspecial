import { CONFIG, SPECIES, canEndTurn, civTier, endTurn, isLastTurn } from '../game'
import { useGame, useStore } from './useGame'
import { SpeciesScreen } from './screens/SpeciesScreen'
import { TurnScreen } from './screens/TurnScreen'
import { BattleScreen } from './screens/BattleScreen'
import { OverScreen } from './screens/OverScreen'
import { HelpLayer } from './help/HelpLayer'
import { Lexicon } from './lexicon/Lexicon'
import { useEffect, useRef, useState } from 'react'
import { RARITY_COLOR, RESOURCE_COLOR, RESOURCE_GLYPH, SPECIES_GLYPH, fmtPop } from './theme'

export function App() {
  const [s] = useGame()
  return (
    <div className="app">
      <TopBar />
      <main className="main">
        {s.phase === 'species' && <SpeciesScreen />}
        {s.phase === 'turn' && <TurnScreen />}
        {s.phase === 'battle' && <BattleScreen />}
        {s.phase === 'over' && <OverScreen />}
      </main>
      <HelpLayer />
    </div>
  )
}

function TopBar() {
  const [s, dispatch] = useGame()
  const store = useStore()
  const tier = civTier(s.population)
  const last = isLastTurn(s)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">⚔</span>
        <span className="brand-name">Halloween Special</span>
      </div>

      {s.phase !== 'species' && (
        <>
          <ol className="timeline" aria-label="Rounds and turns" data-help="timeline">
            {Array.from({ length: CONFIG.rounds }, (_, r) => (
              <li key={r} className={`tl-round ${r < s.round ? 'past' : r === s.round ? 'now' : ''}`}>
                {r === s.round && s.phase !== 'over' ? (
                  <span className="tl-turns">
                    {Array.from({ length: CONFIG.turnsPerRound }, (_, t) => (
                      <i key={t} className={t < s.turn ? 'past' : t === s.turn ? 'now' : ''} />
                    ))}
                  </span>
                ) : (
                  <span className={`tl-era ${r < s.round ? 'past' : ''}`} />
                )}
                <span
                  className={`tl-battle ${s.history[r] ? (s.history[r]!.won ? 'won' : 'lost') : r === s.round && s.battle?.kind === 'round' ? 'now' : ''}`}
                  title={`Battle ${r + 1}`}
                >
                  ⚔
                </span>
              </li>
            ))}
          </ol>

          <dl className="vitals">
            {s.species && (
              <div title={SPECIES[s.species].text} data-help="people">
                <dt>People</dt>
                <dd>
                  {SPECIES_GLYPH[s.species]} {SPECIES[s.species].name}
                </dd>
              </div>
            )}
            <div data-help="turn">
              <dt>Turn</dt>
              <dd>
                {s.round + 1}·{s.turn + 1}
                <small>/{CONFIG.turnsPerRound}</small>
              </dd>
            </div>
            <div data-help="population">
              <dt>Population</dt>
              <dd>{fmtPop(s.population)}</dd>
            </div>
            <div data-help="tier">
              <dt>Tier</dt>
              <dd style={{ color: RARITY_COLOR[tier] }}>{tier}</dd>
            </div>
            <div data-help="gold">
              <dt>Gold</dt>
              <dd style={{ color: RESOURCE_COLOR.gold }}>
                {RESOURCE_GLYPH.gold} {s.stock.gold}
              </dd>
            </div>
            <div data-help="morale">
              <dt>Morale</dt>
              <dd className={s.morale < 25 ? 'danger' : ''} style={{ color: s.morale >= 25 ? '#9fd3ea' : undefined }}>
                ✦ {s.morale}
                <small>/{CONFIG.morale.max}</small>
              </dd>
            </div>
          </dl>
        </>
      )}

      <div className="topbar-actions">
        {s.phase === 'turn' && (
          <button
            className={`btn ${last ? 'btn-war' : 'btn-primary'}`}
            data-help="end-turn"
            disabled={!canEndTurn(s)}
            title={last && s.troop.length === 0 ? 'Your troop is empty: marching now forfeits the battle' : undefined}
            onClick={() =>
              (!last || s.troop.length > 0 || confirm('Your troop is empty. March anyway and forfeit this battle?')) && dispatch(endTurn)
            }
          >
            {last ? 'March to battle' : 'End turn'}
          </button>
        )}
        <SettingsMenu canReset={s.phase !== 'species'} onReset={() => confirm('Abandon this run and start over?') && store.reset()} />
      </div>
    </header>
  )
}

function SettingsMenu({ canReset, onReset }: { canReset: boolean; onReset: () => void }) {
  const [open, setOpen] = useState(false)
  const [lexicon, setLexicon] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="settings" ref={ref}>
      <button className={`btn btn-ghost settings-btn ${open ? 'on' : ''}`} aria-label="Settings" aria-expanded={open} onClick={() => setOpen(!open)}>
        ⚙
      </button>
      {open && (
        <div className="settings-menu" role="menu">
          <button
            role="menuitem"
            onClick={() => {
              setLexicon(true)
              setOpen(false)
            }}
          >
            <span>📖</span> Lexicon
            <small>Every affinity, building and unit</small>
          </button>
          {canReset && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onReset()
              }}
            >
              <span>↺</span> New run
              <small>Abandon this run</small>
            </button>
          )}
        </div>
      )}
      {lexicon && <Lexicon onClose={() => setLexicon(false)} />}
    </div>
  )
}
