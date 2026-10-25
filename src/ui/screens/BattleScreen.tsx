import { CONFIG, RESOURCE_LABEL, finishBattle, type Material } from '../../game'
import { useGame } from '../useGame'
import { BattleView } from '../battle/BattleView'
import { UnitCard } from '../components/UnitCard'

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

  return (
    <BattleView
      result={result}
      names={[skirmish ? `Raid · turn ${s.turn + 1}` : `Round ${s.round + 1}`, name]}
      labels={['Your troop', skirmish ? 'Camp' : 'Opposing civ']}
      done={(finished) =>
        finished && (
          <div className={`verdict ${outcome.won ? 'won' : 'lost'}`}>
            <h2 data-help={skirmish ? 'camp' : 'battle'}>{outcome.won ? (skirmish ? 'Razed' : 'Victory') : outcome.draw ? 'Stalemate' : skirmish ? 'Repelled' : 'Defeat'}</h2>
            <p>
              {outcome.won
                ? `The field is yours${lootText.length ? `: ${lootText.join(', ')}` : ''}.`
                : skirmish
                  ? `${outcome.enemySurvivors} of them still hold the camp. Your civilization is unharmed.`
                  : `${outcome.enemySurvivors} of theirs still stand. Your civilization has fallen.`}
            </p>
            {outcome.fallen.length > 0 && (
              <div className="fallen">
                <h3 data-help="permadeath">
                  The fallen ({outcome.fallen.length}): {outcome.fallenReturn ? 'elven rites will bring them back' : 'they will not return'}
                </h3>
                <div className="fallen-list">
                  {outcome.fallen.map((u) => (
                    <UnitCard key={u.uid} unit={u} compact dim={!outcome.fallenReturn} />
                  ))}
                </div>
              </div>
            )}
            <button className="btn btn-primary" onClick={() => dispatch(finishBattle)}>
              {skirmish ? 'Return to the city' : !outcome.won ? 'Accept your fate' : s.round >= CONFIG.rounds - 1 ? 'Claim the age' : 'Onward to the next age'}
            </button>
          </div>
        )
      }
    />
  )
}
