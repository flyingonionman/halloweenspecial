import { CONFIG, SPECIES, canEndTurn, civTier, endTurn, glory, isLastTurn } from '../game'
import { useGame, useStore } from './useGame'
import { SpeciesScreen } from './screens/SpeciesScreen'
import { TurnScreen } from './screens/TurnScreen'
import { BattleScreen } from './screens/BattleScreen'
import { OverScreen } from './screens/OverScreen'
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
          <ol className="timeline" aria-label="Rounds and turns">
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
              <div title={SPECIES[s.species].text}>
                <dt>People</dt>
                <dd>
                  {SPECIES_GLYPH[s.species]} {SPECIES[s.species].name}
                </dd>
              </div>
            )}
            <div>
              <dt>Turn</dt>
              <dd>
                {s.round + 1}·{s.turn + 1}
                <small>/{CONFIG.turnsPerRound}</small>
              </dd>
            </div>
            <div>
              <dt>Population</dt>
              <dd>{fmtPop(s.population)}</dd>
            </div>
            <div>
              <dt>Tier</dt>
              <dd style={{ color: RARITY_COLOR[tier] }}>{tier}</dd>
            </div>
            <div>
              <dt>Gold</dt>
              <dd style={{ color: RESOURCE_COLOR.gold }}>
                {RESOURCE_GLYPH.gold} {s.stock.gold}
              </dd>
            </div>
            <div>
              <dt>Vitality</dt>
              <dd className={s.hp <= s.maxHp * 0.3 ? 'danger' : ''}>
                {s.hp}
                <small>/{s.maxHp}</small>
              </dd>
            </div>
            <div title="Development × 2^wins. Doubled if you win every round.">
              <dt>Glory</dt>
              <dd className="gold">{glory(s)}</dd>
            </div>
          </dl>
        </>
      )}

      <div className="topbar-actions">
        {s.phase === 'turn' && (
          <button
            className={`btn ${last ? 'btn-war' : 'btn-primary'}`}
            disabled={!canEndTurn(s)}
            title={last && s.troop.length === 0 ? 'Your troop is empty: marching now forfeits the battle' : undefined}
            onClick={() =>
              (!last || s.troop.length > 0 || confirm('Your troop is empty. March anyway and forfeit this battle?')) && dispatch(endTurn)
            }
          >
            {last ? 'March to battle' : 'End turn'}
          </button>
        )}
        {s.phase !== 'species' && (
          <button className="btn btn-ghost" onClick={() => confirm('Abandon this run and start over?') && store.reset()}>
            New run
          </button>
        )}
      </div>
    </header>
  )
}
