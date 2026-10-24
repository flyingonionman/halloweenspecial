import { civTier } from '../../game'
import { useGame, useStore } from '../useGame'
import { RARITY_COLOR, fmtPop } from '../theme'
import { UnitCard } from '../components/UnitCard'

export function OverScreen() {
  const [s] = useGame()
  const store = useStore()
  const tier = civTier(s.civ.population)
  return (
    <div className={`over ${s.victory ? 'won' : 'lost'}`}>
      <p className="over-kicker">{s.victory ? 'The age is yours' : 'Your civilization has fallen'}</p>
      <h1>{s.victory ? 'Ascendant' : 'Ruin'}</h1>
      <p className="over-sub">
        Reached {fmtPop(s.civ.population)} souls · <span style={{ color: RARITY_COLOR[tier] }}>{tier}</span> tier · {s.hp}% vitality
      </p>
      <ol className="over-history">
        {s.history.map((h) => (
          <li key={h.round} className={h.won ? 'won' : 'lost'}>
            <span>Round {h.round + 1}</span>
            <span>{h.opponent}</span>
            <span>{h.won ? 'Victory' : `Defeat, −${h.damage}%`}</span>
          </li>
        ))}
      </ol>
      {s.troop.length > 0 && (
        <div className="over-troop">
          {s.troop.map((u) => (
            <UnitCard key={u.uid} unit={u} compact />
          ))}
        </div>
      )}
      <button className="btn btn-primary" onClick={() => store.reset()}>
        Begin a new run
      </button>
    </div>
  )
}
