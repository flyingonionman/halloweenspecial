import { civTier, ownedTiles } from '../../game'
import { useGame, useStore } from '../useGame'
import { RARITY_COLOR, fmtPop } from '../theme'
import { FigureCard } from '../components/FigureCard'

export function OverScreen() {
  const [s] = useGame()
  const store = useStore()
  const tier = civTier(s.population)
  const wins = s.history.filter((h) => h.won).length
  return (
    <div className={`over ${s.victory ? 'won' : 'lost'}`}>
      <p className="over-kicker">{s.victory ? 'Your civilization endures' : 'Your civilization has fallen'}</p>
      <h1>{s.victory ? 'Ascendant' : 'Ruin'}</h1>
      <p className="over-sub">
        {wins}/{s.history.length} battles won · {fmtPop(s.population)} souls · {ownedTiles(s.map).length} tiles ·{' '}
        <span style={{ color: RARITY_COLOR[tier] }}>{tier}</span> tier
      </p>
      <ol className="over-history">
        {s.history.map((h) => (
          <li key={h.round} className={h.won ? 'won' : 'lost'}>
            <span>Round {h.round + 1}</span>
            <span>{h.opponent}</span>
            <span>{h.won ? 'Victory' : 'Fell'}</span>
          </li>
        ))}
      </ol>
      {s.troop.length > 0 && (
        <div className="over-troop">
          {s.troop.map((u) => (
            <FigureCard key={u.uid} unit={u} corner={`Lv${u.level}`} />
          ))}
        </div>
      )}
      <button className="btn btn-primary" onClick={() => store.reset()}>
        Begin a new run
      </button>
    </div>
  )
}
