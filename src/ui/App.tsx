import {
  CONFIG,
  RESOURCE_LABEL,
  STOCK_RESOURCES,
  canEndTurn,
  civTier,
  netYields,
  endTurn,
  growthRate,
  isLastTurn,
  moraleRegen,
  ownedTiles,
  territoryCap,
  OMEN_DEFS,
  activeOmen,
} from '../game'
import { useGame, useStore } from './useGame'
import { SpeciesScreen } from './screens/SpeciesScreen'
import { PopulationTab, ResourcesTab, TurnScreen } from './screens/TurnScreen'
import { BattleScreen } from './screens/BattleScreen'
import { OverScreen } from './screens/OverScreen'
import { HelpLayer } from './help/HelpLayer'
import { Toaster } from './toast'
import { Lexicon } from './lexicon/Lexicon'
import { Credits } from './Credits'
import { TitleScreen } from './screens/TitleScreen'
import { CombatDebugger } from './debugger/CombatDebugger'
import { useEffect, useRef, useState } from 'react'
import { RARITY_COLOR, RESOURCE_COLOR, RESOURCE_GLYPH, SPECIES_GLYPH, fmtPop } from './theme'

/**
 * Layout (StarCraft-style corners):
 *   top left     — population, growth, tier, species (click: birth odds)
 *   top right    — every resource you're producing right now, morale, End turn (click: details)
 *   bottom left  — game name, round/turn timeline, ⚙ menu
 */
export type Screen = 'title' | 'game' | 'debug'

/** `?debug` opens the combat debugger, `?seed=` / `?play` skip the title. */
function initialScreen(): Screen {
  const q = new URLSearchParams(location.search)
  if (q.has('debug')) return 'debug'
  if (q.has('seed') || q.has('play')) return 'game'
  return 'title'
}

export function App() {
  const [s] = useGame()
  const [screen, setScreen] = useState<Screen>(initialScreen)

  if (screen === 'title') {
    return (
      <div className="app app-full">
        <TitleScreen onStart={() => setScreen('game')} onDebug={() => setScreen('debug')} />
        <HelpLayer />
      </div>
    )
  }
  if (screen === 'debug') {
    return (
      <div className="app app-full">
        <main className="main">
          <CombatDebugger onExit={() => setScreen('title')} />
        </main>
        <HelpLayer />
      </div>
    )
  }
  return (
    <div className="app">
      <TopBar />
      <main className="main">
        {s.phase === 'species' && <SpeciesScreen />}
        {s.phase === 'turn' && <TurnScreen />}
        {s.phase === 'battle' && <BattleScreen />}
        {s.phase === 'over' && <OverScreen />}
      </main>
      {s.phase !== 'battle' && <CornerMenu onScreen={setScreen} />}
      <HelpLayer />
      <Toaster />
    </div>
  )
}

/** A top-bar block that opens a panel under it; closes on an outside click or Escape. */
function Dropdown({ className, label, help, align, children }: { className: string; label: React.ReactNode; help?: string; align: 'left' | 'right'; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className={`dropdown ${className}`} ref={ref}>
      <button className={`dropdown-trigger ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title={help}>
        {label}
      </button>
      {open && <div className={`dropdown-panel ${align}`}>{children}</div>}
    </div>
  )
}

function TopBar() {
  const [s] = useGame()
  const tier = civTier(s.population)
  const playing = s.phase !== 'species'
  // Income after academy upkeep: what you actually keep each turn.
  const y = playing ? netYields(s) : null
  // Everything you hold or produce (gold always; food is a flow, shown separately).
  const held = y ? STOCK_RESOURCES.filter((r) => r === 'gold' || s.stock[r] > 0 || y[r] !== 0) : []

  return (
    <header className="topbar">
      {playing && (
        <Dropdown
          className="pop-badge"
          align="left"
          help="Population, rarity and affinity odds"
          label={
            <>
              {s.species && <span className="pb-species">{SPECIES_GLYPH[s.species]}</span>}
              <span className="pb-main">
                <b>{fmtPop(s.population)}</b>
                <small>
                  +{Math.round(growthRate(s) * 100)}%/turn · <span style={{ color: RARITY_COLOR[tier] }}>{tier}</span>
                </small>
              </span>
            </>
          }
        >
          <PopulationTab />
        </Dropdown>
      )}

      {playing && y && (
        // A flat row: every resource you hold or produce, one cell each (StarCraft-style).
        <div className="res-strip">
          {held.map((r) => (
            <span key={r} className="rs-item" style={{ color: RESOURCE_COLOR[r] }} title={RESOURCE_LABEL[r]} data-help={`resource:${r}`}>
              <i>{RESOURCE_GLYPH[r]}</i>
              <b>{s.stock[r]}</b>
              {y[r] !== 0 && <small className={y[r] < 0 ? 'neg' : ''}>{y[r] > 0 ? '+' : ''}{y[r]}</small>}
            </span>
          ))}
          {y.food > 0 && (
            <span className="rs-item" style={{ color: RESOURCE_COLOR.food }} title="Food (per turn)" data-help="food">
              <i>{RESOURCE_GLYPH.food}</i>
              <small>+{y.food}</small>
            </span>
          )}
          <span className={`rs-item rs-morale ${s.morale < 25 ? 'danger' : ''}`} title="Morale" data-help="morale">
            <i>✦</i>
            <b>{s.morale}</b>
            <small>+{moraleRegen(s)}</small>
          </span>
          <span className="rs-item rs-land" title="Land" data-help="land">
            <i>⬡</i>
            <b>{ownedTiles(s.map).length}</b>
            <small>/{territoryCap(s)}</small>
          </span>
          <Dropdown className="rs-more" align="right" help="Land, claims, troop bonuses and the chronicle" label="⋯">
            <ResourcesTab />
          </Dropdown>
        </div>
      )}
    </header>
  )
}

/** Docked under the side panel: ⚙ menu, game name + where you are in the run, and End turn. */
function CornerMenu({ onScreen }: { onScreen: (s: Screen) => void }) {
  const [s, dispatch] = useGame()
  const store = useStore()
  const last = isLastTurn(s)
  return (
    <div className="corner-menu">
      <SettingsMenu canReset={s.phase !== 'species'} onReset={() => confirm('Abandon this run and start over?') && store.reset()} onScreen={onScreen} />
      <div className="cm-text">
        <span className="cm-title">
          <span className="brand">
            <span className="brand-mark">⚔</span>
            <span className="brand-name">Halloween Special</span>
          </span>
          {s.phase !== 'species' && (
            <span className="cm-where" data-help="turn">
              R{s.round + 1} · T{s.turn + 1}/{CONFIG.turnsPerRound}
            </span>
          )}
          {s.phase === 'turn' && (
            <span className={`cm-countdown ${last ? 'now' : ''}`} data-help="timeline">
              {last ? '⚔ Battle after this turn' : `⚔ Battle in ${CONFIG.turnsPerRound - s.turn} turns`}
            </span>
          )}
          {s.phase === 'turn' && activeOmen(s) && (
            <span className="cm-omen" data-help={`omen:${activeOmen(s)}`}>
              {OMEN_DEFS[activeOmen(s)!].glyph} {OMEN_DEFS[activeOmen(s)!].name}
            </span>
          )}
        </span>
        {s.phase !== 'species' && (
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
        )}
      </div>
      {s.phase === 'turn' && (
        <button
          className={`btn ${last ? 'btn-war' : 'btn-primary'} cm-end`}
          data-help="end-turn"
          disabled={!canEndTurn(s)}
          title={last && s.troop.length === 0 ? 'Your troop is empty: marching now forfeits the battle' : undefined}
          onClick={() => (!last || s.troop.length > 0 || confirm('Your troop is empty. March anyway and forfeit this battle?')) && dispatch(endTurn)}
        >
          {last ? 'March to battle' : 'End turn'}
        </button>
      )}
    </div>
  )
}

function SettingsMenu({ canReset, onReset, onScreen }: { canReset: boolean; onReset: () => void; onScreen: (s: Screen) => void }) {
  const [open, setOpen] = useState(false)
  const [lexicon, setLexicon] = useState(false)
  const [credits, setCredits] = useState(false)
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
          <button
            role="menuitem"
            onClick={() => {
              setCredits(true)
              setOpen(false)
            }}
          >
            <span>✦</span> Credits
            <small>Models, textures and fonts</small>
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
          <button role="menuitem" onClick={() => onScreen('debug')}>
            <span>⚔</span> Combat debugger
            <small>Test fights without playing (your run is kept)</small>
          </button>
          <button role="menuitem" onClick={() => onScreen('title')}>
            <span>☰</span> Main menu
            <small>Your run is kept</small>
          </button>
        </div>
      )}
      {lexicon && <Lexicon onClose={() => setLexicon(false)} />}
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>
  )
}
