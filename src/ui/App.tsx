import { CONFIG, canEndEra, civTier, endEra, isLastEra } from '../game'
import { useGame, useStore } from './useGame'
import { EraScreen } from './screens/EraScreen'
import { BattleScreen } from './screens/BattleScreen'
import { OverScreen } from './screens/OverScreen'
import { RARITY_COLOR, fmtPop } from './theme'

export function App() {
  const [s] = useGame()
  return (
    <div className="app">
      <TopBar />
      <main className="main">
        {s.phase === 'era' && <EraScreen />}
        {s.phase === 'battle' && <BattleScreen />}
        {s.phase === 'over' && <OverScreen />}
      </main>
    </div>
  )
}

function TopBar() {
  const [s, dispatch] = useGame()
  const store = useStore()
  const tier = civTier(s.civ.population)
  const last = isLastEra(s)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">⚔</span>
        <span className="brand-name">Halloween Special</span>
      </div>

      <ol className="timeline" aria-label="Rounds and eras">
        {Array.from({ length: CONFIG.rounds }, (_, r) => (
          <li key={r} className={`tl-round ${r < s.round ? 'past' : r === s.round ? 'now' : ''}`}>
            {Array.from({ length: CONFIG.erasPerRound }, (_, e) => {
              const now = r === s.round && e === s.era && s.phase === 'era'
              const past = r < s.round || (r === s.round && (e < s.era || s.phase !== 'era'))
              return <span key={e} className={`tl-era ${now ? 'now' : past ? 'past' : ''}`} />
            })}
            <span
              className={`tl-battle ${s.history[r] ? (s.history[r]!.won ? 'won' : 'lost') : r === s.round && s.phase === 'battle' ? 'now' : ''}`}
              title={`Battle ${r + 1}`}
            >
              ⚔
            </span>
          </li>
        ))}
      </ol>

      <dl className="vitals">
        <div>
          <dt>Population</dt>
          <dd>{fmtPop(s.civ.population)}</dd>
        </div>
        <div>
          <dt>Tier</dt>
          <dd style={{ color: RARITY_COLOR[tier] }}>{tier}</dd>
        </div>
        <div>
          <dt>Treasury</dt>
          <dd className="gold">{s.civ.money}</dd>
        </div>
        <div>
          <dt>Vitality</dt>
          <dd className={s.hp <= 30 ? 'danger' : ''}>{s.hp}%</dd>
        </div>
      </dl>

      <div className="topbar-actions">
        {s.phase === 'era' && (
          <button
            className={`btn ${last ? 'btn-war' : 'btn-primary'}`}
            disabled={!canEndEra(s)}
            title={!canEndEra(s) ? 'You need at least one unit in your troop' : undefined}
            onClick={() => dispatch(endEra)}
          >
            {last ? 'March to battle' : `End era ${s.era + 1}`}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => confirm('Abandon this run and start over?') && store.reset()}>
          New run
        </button>
      </div>
    </header>
  )
}
