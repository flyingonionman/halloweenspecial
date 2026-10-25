import { civTier, development, glory, ownedTiles } from '../../game'
import { useGame, useStore } from '../useGame'
import { RARITY_COLOR, fmtPop } from '../theme'
import { UnitCard } from '../components/UnitCard'

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
        {fmtPop(s.population)} souls · {ownedTiles(s.map).length} tiles · <span style={{ color: RARITY_COLOR[tier] }}>{tier}</span> tier · {s.hp}/{s.maxHp} vitality
      </p>
      <div className="glory-calc">
        <span>
          <b>{development(s)}</b>
          <small>development</small>
        </span>
        <span>×</span>
        <span>
          <b>{2 ** wins}</b>
          <small>2^{wins} wins</small>
        </span>
        {wins === 5 && (
          <>
            <span>×</span>
            <span>
              <b>2</b>
              <small>flawless</small>
            </span>
          </>
        )}
        <span>=</span>
        <span className="glory-total">
          <b>{glory(s)}</b>
          <small>glory</small>
        </span>
      </div>
      <ol className="over-history">
        {s.history.map((h) => (
          <li key={h.round} className={h.won ? 'won' : 'lost'}>
            <span>Round {h.round + 1}</span>
            <span>{h.opponent}</span>
            <span>{h.won ? 'Victory' : `Defeat, −${h.damage}`}</span>
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
