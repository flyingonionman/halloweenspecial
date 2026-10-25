import { SPECIES, SPECIES_IDS, chooseSpecies } from '../../game'
import { useGame } from '../useGame'
import { SPECIES_GLYPH } from '../theme'

export function SpeciesScreen() {
  const [, dispatch] = useGame()
  return (
    <div className="species">
      <p className="over-kicker">A new age begins</p>
      <h1 className="species-title">Choose your people</h1>
      <p className="lede species-lede">
        Your species bends the rules of your civilization: the market, your troop, your coffers, your fate. It never fights for
        you.
      </p>
      <div className="species-grid">
        {SPECIES_IDS.map((id, i) => (
          <button
            key={id}
            className="species-card"
            data-help={`species:${id}`}
            style={{ animationDelay: `${i * 50}ms` }}
            onClick={() => dispatch((s) => chooseSpecies(s, id))}
          >
            <span className="species-glyph">{SPECIES_GLYPH[id]}</span>
            <span className="species-name">{SPECIES[id].name}</span>
            <span className="species-text">{SPECIES[id].text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
